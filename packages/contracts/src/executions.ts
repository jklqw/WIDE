import { z } from "zod";

export const LANGUAGE_IDS = [
  "python",
  "javascript",
  "typescript",
  "c",
  "cpp",
  "java",
  "go",
] as const;
export const LanguageIdSchema = z.enum(LANGUAGE_IDS);
export type LanguageId = z.infer<typeof LanguageIdSchema>;

export const EXECUTION_STATUSES = [
  "queued",
  "preparing",
  "running",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "resource_limited",
] as const;
export const ExecutionStatusSchema = z.enum(EXECUTION_STATUSES);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const CreateExecutionRequestSchema = z.object({
  sourcePath: z.string().min(1).max(1024),
  stdin: z.string().max(64 * 1024).optional(),
});
export type CreateExecutionRequest = z.infer<typeof CreateExecutionRequestSchema>;

export const ExecutionJobSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sourcePath: z.string(),
  languageId: LanguageIdSchema,
  status: ExecutionStatusSchema,
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  compileDurationMs: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  exitCode: z.number().int().nullable(),
  resourceLimitReason: z.string().nullable(),
  outputBytes: z.number().int().nonnegative(),
});
export type ExecutionJob = z.infer<typeof ExecutionJobSchema>;

export const CompilerDiagnosticSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  col: z.number().int().nonnegative().optional(),
  severity: z.enum(["error", "warning", "note", "info"]),
  message: z.string(),
});
export type CompilerDiagnostic = z.infer<typeof CompilerDiagnosticSchema>;

export const ExecutionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: ExecutionStatusSchema }),
  z.object({
    type: z.literal("compile_diagnostics"),
    diagnostics: z.array(CompilerDiagnosticSchema),
    compileDurationMs: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("stdout"), data: z.string() }),
  z.object({ type: z.literal("stderr"), data: z.string() }),
  z.object({
    type: z.literal("completed"),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative(),
    compileDurationMs: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("limit"),
    reason: z.string(),
    exitCode: z.number().int().nullable().optional(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;
