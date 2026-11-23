import { z } from "zod";

export const TEMPLATE_IDS = [
  "blank",
  "python",
  "javascript",
  "typescript",
  "c",
  "cpp",
  "java",
  "go",
  "html-web",
] as const;
export const TemplateIdSchema = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  templateId: TemplateIdSchema.default("blank"),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

export const UpdateWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  runtimePreference: z.string().max(40).nullable().optional(),
});
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;

export const WorkspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  templateId: TemplateIdSchema,
  runtimePreference: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  languageBadge: z.string().optional(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

export const WorkspaceListQuerySchema = z.object({
  q: z.string().max(120).optional(),
});
export type WorkspaceListQuery = z.infer<typeof WorkspaceListQuerySchema>;
