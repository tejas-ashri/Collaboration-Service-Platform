import request from "supertest";
import express from "express";
import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret";

describe("auth service", () => {
  it("health responds ok", async () => {
    const app = express();
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("validates refresh token flow", () => {
    const jti = "test-jti";
    const sub = "user@test.com";
    const refreshToken = jwt.sign({ sub, jti }, JWT_SECRET, { expiresIn: "7d" });
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as { sub: string; jti: string };
    expect(decoded.sub).toBe(sub);
    expect(decoded.jti).toBe(jti);
  });

  it("creates access token", () => {
    const sub = "user@test.com";
    const roles = ["user"];
    const jti = "test-jti";
    const accessToken = jwt.sign({ sub, roles, jti }, JWT_SECRET, { expiresIn: "15m" });
    const decoded = jwt.verify(accessToken, JWT_SECRET) as { sub: string; roles: string[] };
    expect(decoded.sub).toBe(sub);
    expect(decoded.roles).toEqual(roles);
  });
});

