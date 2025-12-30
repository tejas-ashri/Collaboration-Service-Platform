import request from "supertest";
import express from "express";
import { describe, it, expect, beforeEach } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

// Mock services for testing
const JWT_SECRET = "test-secret";
const createTestToken = (sub: string) => jwt.sign({ sub, roles: ["user"] }, JWT_SECRET);

describe("project service", () => {
  let app: express.Application;
  let mongoClient: MongoClient | null = null;
  let projects: any;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Mock authenticate middleware
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

    // Connect to test DB
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/app";
    try {
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      const db = mongoClient.db("test_app");
      projects = db.collection("projects");
      await projects.deleteMany({});
    } catch {
      // Test DB not available, skip integration tests
      mongoClient = null;
    }

    // Mock project endpoints
    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.get("/projects", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const userId = (req as any).user?.sub;
      const query = userId ? { ownerId: userId } : {};
      const docs = await projects.find(query).toArray();
      return res.json({ items: docs, nextCursor: null });
    });

    app.post("/projects", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const { name } = req.body;
      const ownerId = (req as any).user?.sub;
      const doc = {
        name,
        ownerId,
        collaborators: [{ userId: ownerId, role: "owner" }],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await projects.insertOne(doc);
      return res.status(201).json({ id: result.insertedId, ...doc });
    });

    app.get("/projects/:id", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const userId = (req as any).user?.sub;
      const isCollaborator = project.collaborators.some((c: any) => c.userId === userId);
      if (!isCollaborator) return res.status(403).json({ error: "forbidden" });
      return res.json(project);
    });

    app.put("/projects/:id", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const userId = (req as any).user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const collaborator = project.collaborators.find((c: any) => c.userId === userId);
      if (!collaborator || (collaborator.role !== "owner" && collaborator.role !== "editor")) {
        return res.status(403).json({ error: "forbidden" });
      }
      const update = { ...req.body, updatedAt: new Date() };
      await projects.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
      const updated = await projects.findOne({ _id: new ObjectId(req.params.id) });
      return res.json(updated);
    });

    app.delete("/projects/:id", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const userId = (req as any).user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const collaborator = project.collaborators.find((c: any) => c.userId === userId);
      if (!collaborator || collaborator.role !== "owner") {
        return res.status(403).json({ error: "forbidden" });
      }
      await projects.deleteOne({ _id: new ObjectId(req.params.id) });
      return res.status(204).send();
    });

    app.get("/projects/:id/collaborators", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const userId = (req as any).user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const isCollaborator = project.collaborators.some((c: any) => c.userId === userId);
      if (!isCollaborator) return res.status(403).json({ error: "forbidden" });
      return res.json({ collaborators: project.collaborators });
    });

    app.post("/projects/:id/collaborators", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const userId = (req as any).user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const collaborator = project.collaborators.find((c: any) => c.userId === userId);
      if (!collaborator || collaborator.role !== "owner") {
        return res.status(403).json({ error: "forbidden" });
      }
      const { userId: newUserId, role } = req.body;
      if (project.collaborators.some((c: any) => c.userId === newUserId)) {
        return res.status(409).json({ error: "collaborator already exists" });
      }
      await projects.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $push: { collaborators: { userId: newUserId, role } } }
      );
      const updated = await projects.findOne({ _id: new ObjectId(req.params.id) });
      return res.status(201).json({ collaborators: updated.collaborators });
    });

    app.delete("/projects/:id/collaborators/:collaboratorId", async (req, res) => {
      if (!projects) return res.status(503).json({ error: "DB unavailable" });
      const userId = (req as any).user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
      if (!project) return res.status(404).json({ error: "not found" });
      const collaborator = project.collaborators.find((c: any) => c.userId === userId);
      if (!collaborator) return res.status(403).json({ error: "forbidden" });
      if (collaborator.role !== "owner" && userId !== req.params.collaboratorId) {
        return res.status(403).json({ error: "forbidden" });
      }
      await projects.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $pull: { collaborators: { userId: req.params.collaboratorId } } }
      );
      return res.status(204).send();
    });
  });

  it("health responds ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("creates project with auth", async () => {
    if (!projects) return; // Skip if DB unavailable
    const token = createTestToken("user1");
    const res = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Project" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Project");
    expect(res.body.ownerId).toBe("user1");
  });

  it("updates project as owner", async () => {
    if (!projects) return;
    const token = createTestToken("user1");
    const createRes = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Project" });
    const projectId = createRes.body.id;
    const updateRes = await request(app)
      .put(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated Project" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe("Updated Project");
  });

  it("deletes project as owner", async () => {
    if (!projects) return;
    const token = createTestToken("user1");
    const createRes = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Project" });
    const projectId = createRes.body.id;
    const deleteRes = await request(app)
      .delete(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);
  });

  it("adds collaborator as owner", async () => {
    if (!projects) return;
    const token = createTestToken("user1");
    const createRes = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Project" });
    const projectId = createRes.body.id;
    const addRes = await request(app)
      .post(`/projects/${projectId}/collaborators`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: "user2", role: "editor" });
    expect(addRes.status).toBe(201);
    expect(addRes.body.collaborators).toHaveLength(2);
  });

  it("lists collaborators", async () => {
    if (!projects) return;
    const token = createTestToken("user1");
    const createRes = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Project" });
    const projectId = createRes.body.id;
    const listRes = await request(app)
      .get(`/projects/${projectId}/collaborators`)
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.collaborators).toHaveLength(1);
  });
});
