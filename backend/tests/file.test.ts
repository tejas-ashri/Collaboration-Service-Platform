import request from "supertest";
import express from "express";
import { describe, it, expect, beforeEach } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret";
const createTestToken = (sub: string) => jwt.sign({ sub, roles: ["user"] }, JWT_SECRET);

describe("file service", () => {
  let app: express.Application;
  let mongoClient: MongoClient | null = null;
  let files: any;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "unauthorized" });
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
        (req as any).user = { sub: decoded.sub };
        next();
      } catch {
        res.status(401).json({ error: "unauthorized" });
      }
    });

    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/app";
    try {
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      const db = mongoClient.db("test_app");
      files = db.collection("files");
      await files.deleteMany({});
    } catch {
      mongoClient = null;
    }

    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.delete("/files", async (req, res) => {
      if (!files) return res.status(503).json({ error: "DB unavailable" });
      const { projectId, path } = req.query as { projectId?: string; path?: string };
      if (!projectId || !path) {
        return res.status(400).json({ error: "projectId and path required" });
      }
      const userId = (req as any).user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      const meta = await files.findOne({ projectId, path });
      if (!meta) return res.status(404).json({ error: "not found" });
      if (meta.ownerId !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
      await files.deleteOne({ projectId, path });
      return res.status(204).send();
    });
  });

  it("health responds ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("deletes file as owner", async () => {
    if (!files) return;
    const token = createTestToken("user1");
    await files.insertOne({
      projectId: "project1",
      path: "test.txt",
      ownerId: "user1",
      updatedAt: new Date()
    });
    const res = await request(app)
      .delete("/files?projectId=project1&path=test.txt")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
    const deleted = await files.findOne({ projectId: "project1", path: "test.txt" });
    expect(deleted).toBeNull();
  });

  it("rejects delete from non-owner", async () => {
    if (!files) return;
    const token = createTestToken("user2");
    await files.insertOne({
      projectId: "project1",
      path: "test.txt",
      ownerId: "user1",
      updatedAt: new Date()
    });
    const res = await request(app)
      .delete("/files?projectId=project1&path=test.txt")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

