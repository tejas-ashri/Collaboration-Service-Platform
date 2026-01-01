import cors from "cors";
import express, { type Request, type Response } from "express";
import { MongoClient, ObjectId } from "mongodb";
import { loadConfig } from "@app/config";
import { createLogger } from "@app/logger";
import { authenticate } from "@app/auth-middleware";
import { projectCreateSchema, type ProjectCreate, paginationSchema, projectUpdateSchema, collaboratorAddSchema } from "@app/types";

const cfg = loadConfig("project-service");
const logger = createLogger(cfg.serviceName);

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authenticate({ log: (args) => logger.warn(args) }));

  if (!cfg.mongoUri) {
    logger.warn("MONGO_URI is not set; project persistence will be disabled.");
  }
  let client: MongoClient | null = null;
  let db: ReturnType<MongoClient["db"]> | null = null;
  let projects: any = null;

  if (cfg.mongoUri) {
    try {
      client = new MongoClient(cfg.mongoUri);
      await client.connect();
      db = client.db("app");
      if (db) {
        projects = db.collection<ProjectCreate & { collaborators: { userId: string; role: string }[]; createdAt: Date; updatedAt: Date }>("projects");
        if (projects) {
          await projects.createIndex({ ownerId: 1, updatedAt: -1 });
          await projects.createIndex({ name: 1, ownerId: 1 });
          await projects.createIndex({ "collaborators.userId": 1 });
        }
      }
      logger.info("Connected to MongoDB");
    } catch (err) {
      logger.warn({ err }, "Failed to connect to MongoDB, continuing without it");
      client = null;
      db = null;
      projects = null;
    }
  }

  app.get("/health", (_: Request, res: Response) => res.json({ status: "ok" }));

  app.get("/projects", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    try {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "invalid pagination" });
      const { limit, cursor } = parsed.data;
      const ownerId = (req as Request & { user?: { sub?: string } }).user?.sub;
      const query: Record<string, unknown> = ownerId ? { ownerId } : {};
      if (cursor) {
        query._id = { $gt: new ObjectId(cursor) };
      }
      const docs = await projects.find(query).sort({ _id: 1 }).limit(limit + 1).toArray();
      const nextCursor = docs.length > limit ? docs[limit]._id : null;
      const items = docs.slice(0, limit);
      return res.json({ items, nextCursor });
    } catch (err) {
      logger.error({ err }, "get projects failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.post("/projects", async (req: Request, res: Response) => {
    if (!projects || !client) {
      logger.warn("MongoDB not available for project creation");
      return res.status(503).json({ error: "DB unavailable", message: "MongoDB connection is not available. Please ensure MongoDB is running." });
    }
    
    // Check if MongoDB connection is still alive
    try {
      await client.db("admin").command({ ping: 1 });
    } catch (err) {
      logger.error({ err }, "MongoDB connection lost");
      return res.status(503).json({ error: "DB unavailable", message: "MongoDB connection lost. Please check MongoDB status." });
    }
    
    try {
      const parsed = projectCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues }, "Invalid project creation payload");
        return res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
      }
      const { name } = parsed.data;
      const user = (req as Request & { user?: { sub?: string } }).user;
      const ownerId = user?.sub ?? parsed.data.ownerId;
      
      if (!ownerId) {
        logger.warn("No ownerId available for project creation");
        return res.status(401).json({ error: "unauthorized: user not authenticated" });
      }
      
      const doc = {
        name,
        ownerId,
        collaborators: [{ userId: ownerId, role: "owner" }],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await projects.insertOne(doc);
      logger.info({ projectId: result.insertedId, name, ownerId }, "Project created");
      return res.status(201).json({ id: result.insertedId, _id: result.insertedId, ...doc });
    } catch (err) {
      logger.error({ err }, "create project failed");
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // Check if it's a MongoDB connection error
      if (errorMessage.includes("Topology is closed") || errorMessage.includes("connection")) {
        return res.status(503).json({ error: "DB unavailable", message: "MongoDB connection error. Please check MongoDB status." });
      }
      return res.status(500).json({ error: "internal server error", message: errorMessage });
    }
  });

  app.get("/projects/:id", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    try {
      const id = req.params.id;
      const project = await projects.findOne({ _id: new ObjectId(id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
      const isCollaborator = project.collaborators.some((c: { userId: string; role: string }) => c.userId === userId);
      if (!isCollaborator) return res.status(403).json({ error: "forbidden" });
      return res.json(project);
    } catch (err) {
      logger.warn({ err }, "get project failed");
      return res.status(400).json({ error: "invalid project id" });
    }
  });

  app.put("/projects/:id", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    const id = req.params.id;
    const parsed = projectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
    }
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    try {
      const project = await projects.findOne({ _id: new ObjectId(id) });
      if (!project) return res.status(404).json({ error: "not found" });

      const collaborator = project.collaborators.find((c: { userId: string; role: string }) => c.userId === userId);
      if (!collaborator) return res.status(403).json({ error: "forbidden" });
      if (collaborator.role !== "owner" && collaborator.role !== "editor") {
        return res.status(403).json({ error: "forbidden: insufficient permissions" });
      }

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.name) {
        update.name = parsed.data.name;
      }

      const result = await projects.updateOne({ _id: new ObjectId(id) }, { $set: update });
      if (result.matchedCount === 0) return res.status(404).json({ error: "not found" });

      const updated = await projects.findOne({ _id: new ObjectId(id) });
      return res.json(updated);
    } catch (err) {
      logger.warn({ err }, "project update failed");
      return res.status(400).json({ error: "invalid project id" });
    }
  });

  app.delete("/projects/:id", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    const id = req.params.id;
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    try {
      const project = await projects.findOne({ _id: new ObjectId(id) });
      if (!project) return res.status(404).json({ error: "not found" });

      const collaborator = project.collaborators.find((c: { userId: string; role: string }) => c.userId === userId);
      if (!collaborator || collaborator.role !== "owner") {
        return res.status(403).json({ error: "forbidden: only owner can delete project" });
      }

      const result = await projects.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ error: "not found" });

      return res.status(204).send();
    } catch (err) {
      logger.warn({ err }, "project delete failed");
      return res.status(400).json({ error: "invalid project id" });
    }
  });

  app.get("/projects/:id/collaborators", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    const id = req.params.id;
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    try {
      const project = await projects.findOne({ _id: new ObjectId(id) });
      if (!project) return res.status(404).json({ error: "not found" });

      const isCollaborator = project.collaborators.some((c: { userId: string; role: string }) => c.userId === userId);
      if (!isCollaborator) return res.status(403).json({ error: "forbidden" });

      return res.json({ collaborators: project.collaborators });
    } catch (err) {
      logger.warn({ err }, "get collaborators failed");
      return res.status(400).json({ error: "invalid project id" });
    }
  });

  app.post("/projects/:id/collaborators", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    const id = req.params.id;
    const parsed = collaboratorAddSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
    }
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    try {
      const project = await projects.findOne({ _id: new ObjectId(id) });
      if (!project) return res.status(404).json({ error: "not found" });

      const collaborator = project.collaborators.find((c: { userId: string; role: string }) => c.userId === userId);
      if (!collaborator || collaborator.role !== "owner") {
        return res.status(403).json({ error: "forbidden: only owner can add collaborators" });
      }

      const { userId: newUserId, role } = parsed.data;
      if (project.collaborators.some((c: { userId: string; role: string }) => c.userId === newUserId)) {
        return res.status(409).json({ error: "collaborator already exists" });
      }

      const updated = await projects.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $push: { collaborators: { userId: newUserId, role } },
          $set: { updatedAt: new Date() }
        } as any,
        { returnDocument: "after" }
      );

      if (!updated) return res.status(404).json({ error: "not found" });
      return res.status(201).json({ collaborators: updated.collaborators });
    } catch (err) {
      logger.warn({ err }, "add collaborator failed");
      return res.status(400).json({ error: "invalid project id" });
    }
  });

  app.delete("/projects/:id/collaborators/:collaboratorId", async (req: Request, res: Response) => {
    if (!projects) return res.status(503).json({ error: "DB unavailable" });
    const id = req.params.id;
    const collaboratorId = req.params.collaboratorId;
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    try {
      const project = await projects.findOne({ _id: new ObjectId(id) });
      if (!project) return res.status(404).json({ error: "not found" });

      const collaborator = project.collaborators.find((c: { userId: string; role: string }) => c.userId === userId);
      if (!collaborator) {
        return res.status(403).json({ error: "forbidden" });
      }

      const targetCollaborator = project.collaborators.find((c: { userId: string; role: string }) => c.userId === collaboratorId);
      if (!targetCollaborator) {
        return res.status(404).json({ error: "collaborator not found" });
      }

      // Owner can remove anyone, or user can remove themselves
      if (collaborator.role !== "owner" && userId !== collaboratorId) {
        return res.status(403).json({ error: "forbidden: can only remove yourself or be owner" });
      }

      // Prevent removing the last owner
      if (targetCollaborator.role === "owner" && project.collaborators.filter((c: { userId: string; role: string }) => c.role === "owner").length === 1) {
        return res.status(400).json({ error: "cannot remove last owner" });
      }

      const updated = await projects.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $pull: { collaborators: { userId: collaboratorId } },
          $set: { updatedAt: new Date() }
        } as any,
        { returnDocument: "after" }
      );

      if (!updated) return res.status(404).json({ error: "not found" });
      return res.status(204).send();
    } catch (err) {
      logger.warn({ err }, "remove collaborator failed");
      return res.status(400).json({ error: "invalid project id" });
    }
  });

  const port = cfg.port === 4000 ? 4001 : cfg.port; // Project service runs on 4001
  app.listen(port, () => {
    logger.info(`Project service listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start project service");
  process.exit(1);
});

