import cors from "cors";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { loadConfig } from "@app/config";
import { createLogger } from "@app/logger";
import { authenticate } from "@app/auth-middleware";
import { authTokenPayloadSchema, type AuthTokenPayload, paginationSchema } from "@app/types";
import { createRedisClients, connectRedis } from "@app/redis";
import { MongoClient, ObjectId } from "mongodb";

const cfg = loadConfig("collab-service");
const logger = createLogger(cfg.serviceName);

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.get("/health", (_: Request, res: Response) => res.json({ status: "ok" }));
  app.use(authenticate({ log: (args) => logger.warn(args) }));

  const mongo = cfg.mongoUri ? new MongoClient(cfg.mongoUri) : null;
  const db = mongo ? mongo.db("app") : null;
  const snapshots = db?.collection("collab_snapshots");
  if (mongo) {
    await mongo.connect();
    await snapshots?.createIndex({ projectId: 1, createdAt: -1 });
    logger.info("Connected to MongoDB for collab snapshots");
  }

  const redisClients = createRedisClients(cfg.redisUrl);
  if (redisClients) {
    await connectRedis(redisClients);
    logger.info("Connected to Redis");
  } else {
    logger.warn("REDIS_URL not set; collaboration will not scale horizontally.");
  }

  app.get("/presence/:projectId", async (req: Request, res: Response) => {
    const projectId = req.params.projectId;
    if (!redisClients) return res.status(503).json({ error: "redis unavailable" });
    const keys = await redisClients.pub.keys(`presence:${projectId}:*`);
    const users = keys.map((k) => k.split(":")[2]);
    return res.json({ users });
  });

  app.get("/snapshots/:projectId", async (req: Request, res: Response) => {
    if (!snapshots) return res.status(503).json({ error: "DB unavailable" });
    const projectId = req.params.projectId;
    try {
      const snapshot = await snapshots.findOne(
        { projectId },
        { sort: { createdAt: -1 } }
      );
      if (!snapshot) return res.status(404).json({ error: "not found" });
      return res.json(snapshot);
    } catch (err) {
      logger.warn({ err }, "snapshot retrieval failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.get("/snapshots/:projectId/history", async (req: Request, res: Response) => {
    if (!snapshots) return res.status(503).json({ error: "DB unavailable" });
    const projectId = req.params.projectId;
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid pagination", details: parsed.error.issues });
    }
    const { limit, cursor } = parsed.data;
    try {
      const query: Record<string, unknown> = { projectId };
      if (cursor) {
        query._id = { $lt: new ObjectId(cursor) };
      }
      const docs = await snapshots
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .toArray();
      const nextCursor = docs.length > limit ? docs[limit]._id.toString() : null;
      const items = docs.slice(0, limit);
      return res.json({ items, nextCursor });
    } catch (err) {
      logger.warn({ err }, "snapshot history retrieval failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });

  if (redisClients) {
    io.adapter(createAdapter(redisClients.pub, redisClients.sub));
    logger.info("Redis adapter enabled for Socket.IO");
  }

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string } | undefined)?.token ||
      (socket.handshake.query.token as string | undefined) ||
      socket.handshake.headers.authorization?.replace("Bearer ", "");
    const projectId = socket.handshake.query.projectId;

    if (!token) return next(new Error("missing token"));
    if (typeof projectId !== "string") return next(new Error("missing projectId"));

    const secret = process.env.JWT_PUBLIC_KEY || process.env.JWT_PRIVATE_KEY;
    if (!secret) return next(new Error("server missing JWT key"));

    try {
      const decoded = jwt.verify(token, secret);
      const parsed = authTokenPayloadSchema.safeParse(decoded);
      if (!parsed.success) return next(new Error("invalid token"));
      socket.data.user = parsed.data as AuthTokenPayload;
      socket.data.projectId = projectId;
      return next();
    } catch (err) {
      logger.warn({ err }, "socket auth failed");
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const projectId: string = socket.data.projectId;
    const room = `project:${projectId}`;
    socket.join(room);
    logger.info({ room, socket: socket.id, user: socket.data.user?.sub }, "client connected");

    if (redisClients) {
      const presenceKey = `presence:${projectId}:${socket.data.user?.sub ?? socket.id}`;
      redisClients.pub.setex(presenceKey, 60, "online").catch((err) => logger.warn({ err }, "presence set failed"));
    }

    let cursorBudget = 60;
    let opBudget = 120;

    const refill = setInterval(() => {
      cursorBudget = Math.min(cursorBudget + 10, 60);
      opBudget = Math.min(opBudget + 20, 120);
    }, 1000);

    socket.on("cursor", (payload) => {
      if (cursorBudget <= 0) return;
      cursorBudget -= 1;
      socket.to(room).emit("cursor", { userId: socket.data.user?.sub ?? socket.id, ...payload });
    });

    socket.on("op", (delta) => {
      if (opBudget <= 0) return;
      opBudget -= 1;
      socket.to(room).emit("op", { userId: socket.data.user?.sub ?? socket.id, delta });
    });

    socket.on("snapshot", async (payload: { content: string }) => {
      if (!snapshots) return;
      try {
        await snapshots.insertOne({
          projectId,
          userId: socket.data.user?.sub,
          content: payload.content,
          createdAt: new Date()
        });
      } catch (err) {
        logger.warn({ err }, "snapshot persist failed");
      }
    });

    socket.on("refreshToken", (token: string, cb?: (ok: boolean) => void) => {
      const secret = process.env.JWT_PUBLIC_KEY || process.env.JWT_PRIVATE_KEY;
      if (!secret) return cb?.(false);
      try {
        const decoded = jwt.verify(token, secret);
        const parsed = authTokenPayloadSchema.safeParse(decoded);
        if (!parsed.success) return cb?.(false);
        socket.data.user = parsed.data as AuthTokenPayload;
        cb?.(true);
      } catch {
        cb?.(false);
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info({ room, socket: socket.id, reason }, "client disconnected");
      if (redisClients) {
        const presenceKey = `presence:${projectId}:${socket.data.user?.sub ?? socket.id}`;
        redisClients.pub.del(presenceKey).catch((err) => logger.warn({ err }, "presence cleanup failed"));
      }
      clearInterval(refill);
    });
  });

  const port = cfg.port + 2;
  httpServer.listen(port, () => {
    logger.info(`Collaboration service listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start collab service");
  process.exit(1);
});

