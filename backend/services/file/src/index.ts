import cors from "cors";
import express, { type Request, type Response } from "express";
import { MongoClient, ObjectId } from "mongodb";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadConfig } from "@app/config";
import { createLogger } from "@app/logger";
import { authenticate } from "@app/auth-middleware";
import { filePresignRequestSchema, type FilePresignRequest, paginationSchema } from "@app/types";

const cfg = loadConfig("file-service");
const logger = createLogger(cfg.serviceName);

const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION ?? "us-east-1";
const s3 = bucket ? new S3Client({ region }) : null;

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authenticate({ log: (args) => logger.warn(args) }));

  if (!bucket) {
    logger.warn("S3_BUCKET not set; presign will fail.");
  }

  const client = cfg.mongoUri ? new MongoClient(cfg.mongoUri) : null;
  const db = client ? client.db("app") : null;
  const files = db?.collection<FilePresignRequest & { ownerId?: string; updatedAt: Date }>("files");

  if (client) {
    await client.connect();
    await files?.createIndex({ projectId: 1, path: 1 }, { unique: true });
    logger.info("Connected to MongoDB");
  }

  app.get("/health", (_: Request, res: Response) => res.json({ status: "ok" }));

  app.get("/files", async (req: Request, res: Response) => {
    if (!files) return res.status(503).json({ error: "DB unavailable" });
    try {
      const parsedPagination = paginationSchema.safeParse(req.query);
      if (!parsedPagination.success) return res.status(400).json({ error: "invalid pagination" });
      const { projectId } = req.query as { projectId?: string };
      if (!projectId) return res.status(400).json({ error: "projectId required" });
      const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
      const { limit, cursor } = parsedPagination.data;
      const query: Record<string, unknown> = { projectId };
      if (cursor) query._id = { $gt: new ObjectId(cursor) };
      const docs = await files.find(query).sort({ _id: 1 }).limit(limit + 1).toArray();
      const filtered = userId ? docs.filter((d) => d.ownerId === userId) : docs;
      const nextCursor = docs.length > limit ? docs[limit]._id : null;
      return res.json({ items: filtered.slice(0, limit), nextCursor });
    } catch (err) {
      logger.error({ err }, "get files failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.get("/files/meta", async (req: Request, res: Response) => {
    if (!files) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { projectId, path } = req.query as { projectId?: string; path?: string };
      if (!projectId || !path) return res.status(400).json({ error: "projectId and path required" });
      const meta = await files.findOne({ projectId, path });
      const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
      if (meta && userId && meta.ownerId !== userId) return res.status(403).json({ error: "forbidden" });
      if (!meta) return res.status(404).json({ error: "not found" });
      return res.json(meta);
    } catch (err) {
      logger.error({ err }, "get file meta failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.post("/files/presign", async (req: Request, res: Response) => {
    try {
      const parsed = filePresignRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
      }
      const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
      const { path, operation, projectId, contentType, contentLength } = parsed.data;
      if (!s3 || !bucket) return res.status(503).json({ error: "object store not configured" });

      const key = `${projectId}/${path}`;
      const expiresIn = 300;
      const command =
        operation === "upload"
          ? new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              ContentType: contentType,
              ContentLength: contentLength
            })
          : new GetObjectCommand({ Bucket: bucket, Key: key });

      const url = await getSignedUrl(s3, command, { expiresIn });

      if (files && operation === "upload") {
        try {
          await files.updateOne(
            { projectId, path },
            {
              $set: {
                projectId,
                path,
                contentType,
                contentLength,
                ownerId: userId,
                updatedAt: new Date()
              }
            },
            { upsert: true }
          );
        } catch (err) {
          logger.warn({ err }, "file metadata update failed");
        }
      }

      return res.json({
        operation,
        url,
        method: operation === "upload" ? "PUT" : "GET",
        headers: contentType ? { "Content-Type": contentType } : undefined,
        expiresIn
      });
    } catch (err) {
      logger.error({ err }, "presign failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.delete("/files", async (req: Request, res: Response) => {
    if (!files) return res.status(503).json({ error: "DB unavailable" });
    const { projectId, path } = req.query as { projectId?: string; path?: string };
    if (!projectId || !path) {
      return res.status(400).json({ error: "projectId and path required" });
    }
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    try {
      const meta = await files.findOne({ projectId, path });
      if (!meta) return res.status(404).json({ error: "not found" });

      if (meta.ownerId !== userId) {
        return res.status(403).json({ error: "forbidden: only owner can delete file" });
      }

      // Delete from S3 if configured
      if (s3 && bucket) {
        const key = `${projectId}/${path}`;
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } catch (err) {
          logger.warn({ err, key }, "S3 delete failed, continuing with metadata deletion");
        }
      }

      // Delete metadata
      const result = await files.deleteOne({ projectId, path });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "not found" });
      }

      return res.status(204).send();
    } catch (err) {
      logger.warn({ err }, "file delete failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  const port = cfg.port + 3;
  app.listen(port, () => {
    logger.info(`File service listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start file service");
  process.exit(1);
});

