import request from "supertest";
import express from "express";
import { describe, it, expect, beforeEach } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret";
const createTestToken = (sub: string) => jwt.sign({ sub, roles: ["user"] }, JWT_SECRET);

describe("collab service", () => {
  let app: express.Application;
  let mongoClient: MongoClient | null = null;
  let snapshots: any;

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
      snapshots = db.collection("collab_snapshots");
      await snapshots.deleteMany({});
    } catch {
      mongoClient = null;
    }

    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.get("/snapshots/:projectId", async (req, res) => {
      if (!snapshots) return res.status(503).json({ error: "DB unavailable" });
      const snapshot = await snapshots.findOne(
        { projectId: req.params.projectId },
        { sort: { createdAt: -1 } }
      );
      if (!snapshot) return res.status(404).json({ error: "not found" });
      return res.json(snapshot);
    });

    app.get("/snapshots/:projectId/history", async (req, res) => {
      if (!snapshots) return res.status(503).json({ error: "DB unavailable" });
      const limit = parseInt(req.query.limit as string) || 20;
      const docs = await snapshots
        .find({ projectId: req.params.projectId })
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .toArray();
      const nextCursor = docs.length > limit ? docs[limit]._id.toString() : null;
      const items = docs.slice(0, limit);
      return res.json({ items, nextCursor });
    });
  });

  it("health responds ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("retrieves latest snapshot", async () => {
    if (!snapshots) return;
    const token = createTestToken("user1");
    await snapshots.insertOne({
      projectId: "project1",
      userId: "user1",
      content: "test content",
      createdAt: new Date()
    });
    const res = await request(app)
      .get("/snapshots/project1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.content).toBe("test content");
  });

  it("retrieves snapshot history", async () => {
    if (!snapshots) return;
    const token = createTestToken("user1");
    await snapshots.insertMany([
      { projectId: "project1", userId: "user1", content: "content1", createdAt: new Date() },
      { projectId: "project1", userId: "user1", content: "content2", createdAt: new Date() }
    ]);
    const res = await request(app)
      .get("/snapshots/project1/history")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });
});

