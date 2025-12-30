import cors from "cors";
import express, { type Request, type Response } from "express";
import { OpenAI } from "openai";
import crypto from "crypto";
import { loadConfig } from "@app/config";
import { createLogger } from "@app/logger";
import { authenticate } from "@app/auth-middleware";
import { createRedisClients, connectRedis } from "@app/redis";

const cfg = loadConfig("ai-service");
const logger = createLogger(cfg.serviceName);

const openaiKey = process.env.OPENAI_API_KEY;
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

function summarizeFallback(prompt: string) {
  return `Stub AI response for: ${prompt.slice(0, 80)}`;
}

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authenticate({ log: (args) => logger.warn(args) }));

  const redis = createRedisClients(cfg.redisUrl);
  if (redis) {
    await connectRedis(redis);
    logger.info("Connected to Redis");
  }

  app.get("/health", (_: Request, res: Response) => res.json({ status: "ok" }));

  app.post("/ai/suggest", async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body ?? {};
      if (!prompt) return res.status(400).json({ error: "prompt required" });

      const cacheKey = `ai:suggest:${hashPrompt(prompt)}`;
      if (redis) {
        try {
          const cached = await redis.pub.get(cacheKey);
          if (cached) {
            return res.json({ suggestion: cached, cached: true });
          }
        } catch (err) {
          logger.warn({ err }, "cache read failed, continuing");
        }
      }

      if (!openai) {
        logger.warn("OPENAI_API_KEY missing; returning stub response");
        return res.json({ suggestion: summarizeFallback(prompt) });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      });

      const text = response.choices[0]?.message?.content ?? "";
      if (redis) {
        try {
          await redis.pub.setex(cacheKey, 60 * 10, text);
        } catch (err) {
          logger.warn({ err }, "cache write failed");
        }
      }
      return res.json({ suggestion: text, cached: false });
    } catch (err) {
      logger.error({ err }, "AI suggest failed");
      return res.status(500).json({ error: "internal server error" });
    }
  });

  app.post("/ai/analyze", async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body ?? {};
      if (!prompt) return res.status(400).json({ error: "prompt required" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const send = (data: string) => res.write(`data: ${data}\n\n`);

      send("Starting analysis...");

      if (!openai) {
        send("AI unavailable; returning stub analysis.");
        send(`Result: ${summarizeFallback(prompt)}`);
        return res.end();
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "You are a static analyzer; respond briefly." }, { role: "user", content: prompt }],
        temperature: 0.1
      });

      const text = response.choices[0]?.message?.content ?? "";
      send(text);
      res.end();
    } catch (err) {
      logger.error({ err }, "AI analyze failed");
      if (!res.headersSent) {
        return res.status(500).json({ error: "internal server error" });
      }
      res.end();
    }
  });

  const port = cfg.port + 4;
  app.listen(port, () => {
    logger.info(`AI service listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start AI service");
  process.exit(1);
});

function hashPrompt(prompt: string) {
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

