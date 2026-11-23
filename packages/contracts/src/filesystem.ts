import { z } from "zod";

export const WorkspaceEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative().optional(),
  revision: z.string().optional(),
  modifiedAt: z.string().datetime().optional(),
});
export type WorkspaceEntry = z.infer<typeof WorkspaceEntrySchema>;

export const ListFilesQuerySchema = z.object({
  path: z.string().max(1024).default(""),
});
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;

export const ReadFileQuerySchema = z.object({
  path: z.string().min(1).max(1024),
});
export type ReadFileQuery = z.infer<typeof ReadFileQuerySchema>;

export const ReadFileResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  revision: z.string(),
  size: z.number().int().nonnegative(),
  isBinary: z.boolean(),
});
export type ReadFileResponse = z.infer<typeof ReadFileResponseSchema>;

export const WriteFileRequestSchema = z.object({
  path: z.string().min(1).max(1024),
  content: z.string().max(2 * 1024 * 1024),
  expectedRevision: z.string().max(128).optional(),
});
export type WriteFileRequest = z.infer<typeof WriteFileRequestSchema>;

export const WriteFileResponseSchema = z.object({
  path: z.string(),
  revision: z.string(),
  size: z.number().int().nonnegative(),
});
export type WriteFileResponse = z.infer<typeof WriteFileResponseSchema>;

export const CreateEntryRequestSchema = z.object({
  path: z.string().min(1).max(1024),
  kind: z.enum(["file", "directory"]),
});
export type CreateEntryRequest = z.infer<typeof CreateEntryRequestSchema>;

export const RenameEntryRequestSchema = z.object({
  from: z.string().min(1).max(1024),
  to: z.string().min(1).max(1024),
});
export type RenameEntryRequest = z.infer<typeof RenameEntryRequestSchema>;

export const DeleteEntryQuerySchema = z.object({
  path: z.string().min(1).max(1024),
});
export type DeleteEntryQuery = z.infer<typeof DeleteEntryQuerySchema>;

export const UploadMetadataSchema = z.object({
  path: z.string().min(1).max(1024),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});
export type UploadMetadata = z.infer<typeof UploadMetadataSchema>;
