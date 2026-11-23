import { z } from "zod";

export const TERMINAL_MAX_INPUT_BYTES = 16 * 1024;
export const TERMINAL_OUTPUT_CHUNK_MAX = 64 * 1024;

export const TerminalSizeSchema = z.object({
  cols: z.number().int().min(20).max(300),
  rows: z.number().int().min(5).max(120),
});
export type TerminalSize = z.infer<typeof TerminalSizeSchema>;

export const TerminalClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("input"),
    data: z.string().min(1).max(TERMINAL_MAX_INPUT_BYTES),
  }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().min(20).max(300),
    rows: z.number().int().min(5).max(120),
  }),
  z.object({ type: z.literal("ping") }),
]);
export type TerminalClientMessage = z.infer<typeof TerminalClientMessageSchema>;

export const TerminalServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("data"), data: z.string().max(TERMINAL_OUTPUT_CHUNK_MAX) }),
  z.object({
    type: z.literal("exit"),
    exitCode: z.number().int().nullable(),
    reason: z.string().optional(),
  }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type TerminalServerMessage = z.infer<typeof TerminalServerMessageSchema>;

export const CreateTerminalRequestSchema = z.object({
  cols: TerminalSizeSchema.shape.cols.default(120),
  rows: TerminalSizeSchema.shape.rows.default(30),
});
export type CreateTerminalRequest = z.infer<typeof CreateTerminalRequestSchema>;

export const TerminalSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  status: z.enum(["active", "closed", "expired"]),
  createdAt: z.string().datetime(),
});
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;
