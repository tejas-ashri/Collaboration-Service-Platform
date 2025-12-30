import { z } from "zod";

export const authTokenPayloadSchema = z.object({
  sub: z.string(),
  roles: z.array(z.string()).default(["user"]),
  exp: z.number().optional(),
  iat: z.number().optional()
});

export type AuthTokenPayload = z.infer<typeof authTokenPayloadSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email()
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const projectCreateSchema = z.object({
  name: z.string().min(1),
  ownerId: z.string().min(1)
});

export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const filePresignRequestSchema = z.object({
  path: z.string().min(1),
  operation: z.enum(["upload", "download"]),
  projectId: z.string().min(1),
  contentType: z.string().optional(),
  contentLength: z.number().int().positive().optional()
});

export type FilePresignRequest = z.infer<typeof filePresignRequestSchema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional()
});

export type Pagination = z.infer<typeof paginationSchema>;

export const projectUpdateSchema = z.object({
  name: z.string().min(1).optional()
});

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const collaboratorRoleSchema = z.enum(["owner", "editor", "viewer"]);

export type CollaboratorRole = z.infer<typeof collaboratorRoleSchema>;

export const collaboratorAddSchema = z.object({
  userId: z.string().min(1),
  role: collaboratorRoleSchema.default("editor")
});

export type CollaboratorAdd = z.infer<typeof collaboratorAddSchema>;

export const snapshotRetrieveSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  cursor: z.string().optional()
});

export type SnapshotRetrieve = z.infer<typeof snapshotRetrieveSchema>;

