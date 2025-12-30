import cors from "cors";
import express, { type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { MongoClient } from "mongodb";
import crypto from "crypto";
import { loadConfig } from "@app/config";
import { createLogger } from "@app/logger";
import {
  authTokenPayloadSchema,
  type AuthTokenPayload,
  loginRequestSchema
} from "@app/types";
import { authenticate } from "@app/auth-middleware";
import { createRedisClients, connectRedis } from "@app/redis";

const cfg = loadConfig("auth-service");
const logger = createLogger(cfg.serviceName);

const keyPair = {
  privateKey: process.env.RSA_PRIVATE_KEY ?? process.env.JWT_PRIVATE_KEY,
  publicKey: process.env.RSA_PUBLIC_KEY ?? process.env.JWT_PUBLIC_KEY ?? process.env.JWT_PRIVATE_KEY
};

const algorithm: jwt.Algorithm = keyPair.privateKey?.startsWith("-----BEGIN") ? "RS256" : "HS256";

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  if (!cfg.mongoUri) {
    logger.warn("MONGO_URI is not set; the service will not be able to persist users.");
  }

  const client = cfg.mongoUri ? new MongoClient(cfg.mongoUri) : null;
  const redis = createRedisClients(cfg.redisUrl);
  if (redis) {
    await connectRedis(redis);
    logger.info("Connected to Redis");
  }

  if (client) {
    await client.connect();
    logger.info("Connected to MongoDB");
  }

  app.get("/health", (_: Request, res: Response) => res.json({ status: "ok" }));

  app.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const parseResult = loginRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "invalid payload", details: parseResult.error.issues });
      }
      const { email } = parseResult.data;

      const jti = crypto.randomUUID();
      const claims = { sub: email, roles: ["user"], jti };
      const secret = keyPair.privateKey;
      if (!secret) {
        logger.error("JWT private key missing");
        return res.status(500).json({ error: "JWT private key missing" });
      }

      const accessToken = jwt.sign(claims, secret, { algorithm, expiresIn: "15m" });
      const refreshToken = jwt.sign({ sub: email, jti }, secret, { algorithm, expiresIn: "7d" });
      if (redis) {
        await redis.pub.setex(`session:${jti}`, 60 * 60 * 24 * 7, JSON.stringify({ sub: email }));
      }
      return res.json({ accessToken, refreshToken });
    } catch (err) {
      logger.error({ err }, "login failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.get("/auth/me", authenticate(), (req: Request, res: Response) => {
    const user = (req as Request & { user?: AuthTokenPayload }).user;
    if (!user) return res.status(401).json({ error: "unauthorized" });
    return res.json({ user });
  });

  app.post("/auth/refresh", async (req: Request, res: Response) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) return res.status(400).json({ error: "missing refreshToken" });
    const secret = keyPair.privateKey;
    if (!secret) return res.status(500).json({ error: "JWT private key missing" });
    try {
      const decoded = jwt.verify(refreshToken, secret) as JwtPayload;
      const { sub, jti } = decoded;
      if (!sub || !jti) return res.status(401).json({ error: "invalid refresh token" });
      if (redis) {
        const exists = await redis.pub.get(`session:${jti}`);
        if (!exists) return res.status(401).json({ error: "session expired" });
      }
      const newJti = crypto.randomUUID();
      const claims = { sub, roles: ["user"], jti: newJti };
      const accessToken = jwt.sign(claims, secret, { algorithm, expiresIn: "15m" });
      const newRefresh = jwt.sign({ sub, jti: newJti }, secret, { algorithm, expiresIn: "7d" });
      if (redis) {
        await redis.pub.setex(`session:${newJti}`, 60 * 60 * 24 * 7, JSON.stringify({ sub }));
        await redis.pub.del(`session:${jti}`);
      }
      return res.json({ accessToken, refreshToken: newRefresh });
    } catch (err) {
      logger.warn({ err }, "refresh failed");
      return res.status(401).json({ error: "unauthorized" });
    }
  });

  app.get("/.well-known/jwks.json", (_: Request, res: Response) => {
    const pub = keyPair.publicKey;
    if (!pub) return res.status(500).json({ error: "JWKS unavailable" });
    const isRSA = pub.startsWith("-----BEGIN");
    const jwk = isRSA
      ? rsaToJwk(pub)
      : {
          kty: "oct",
          k: Buffer.from(pub).toString("base64"),
          alg: "HS256",
          use: "sig",
          kid: "main"
        };
    return res.json({ keys: [jwk] });
  });

  app.listen(cfg.port, () => {
    logger.info(`Auth service listening on :${cfg.port}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start auth service");
  process.exit(1);
});

function rsaToJwk(pem: string) {
  // Minimal RSA public PEM to JWK converter for JWKS (no x5c). For full fidelity, use jose.
  const der = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");
  const buf = Buffer.from(der, "base64");
  // Skip simple DER parsing; surface as-is.
  return {
    kty: "RSA",
    alg: "RS256",
    use: "sig",
    kid: "main",
    n: buf.toString("base64"),
    e: Buffer.from([0x01, 0x00, 0x01]).toString("base64")
  };
}


