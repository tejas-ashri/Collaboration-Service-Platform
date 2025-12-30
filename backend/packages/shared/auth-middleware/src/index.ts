import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { authTokenPayloadSchema, type AuthTokenPayload } from "@app/types";

type Options = {
  /**
   * Optional logger function signature; kept generic to avoid hard dependency.
   */
  log?: (args: unknown) => void;
};

export function authenticate(options: Options = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "missing token" });
    const token = header.slice("Bearer ".length);

    const secret = process.env.JWT_PUBLIC_KEY || process.env.JWT_PRIVATE_KEY;
    if (!secret) return res.status(500).json({ error: "JWT key missing" });

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      const parsed = authTokenPayloadSchema.safeParse(decoded);
      if (!parsed.success) return res.status(401).json({ error: "invalid token" });
      (req as Request & { user?: AuthTokenPayload }).user = parsed.data;
      return next();
    } catch (err) {
      options.log?.({ err });
      return res.status(401).json({ error: "unauthorized" });
    }
  };
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: AuthTokenPayload }).user;
    if (!user?.roles?.includes(role)) return res.status(403).json({ error: "forbidden" });
    return next();
  };
}

