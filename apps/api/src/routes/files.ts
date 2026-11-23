import type { FastifyInstance } from "fastify";
import {
  CreateEntryRequestSchema,
  DeleteEntryQuerySchema,
  ListFilesQuerySchema,
  ReadFileQuerySchema,
  RenameEntryRequestSchema,
  WriteFileRequestSchema,
  WorkspaceEntrySchema,
} from "@ide/contracts";
import { AppError } from "../lib/errors.js";
import { assertWorkspaceAccess } from "../services/authorization.js";
import { WorkspaceFS, LIMITS } from "../services/fs-engine.js";

function fsFor(app: FastifyInstance, storageKey: string) {
  return new WorkspaceFS(app.env.WORKSPACE_STORAGE_ROOT, storageKey);
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  const authed = { preHandler: app.requireAuth };

  async function context(request: { user?: { id: string }; params: unknown }) {
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await assertWorkspaceAccess(app.prisma, request.user!.id, workspaceId);
    return fsFor(app, ws.storageKey);
  }

  app.get("/api/v1/workspaces/:workspaceId/files", authed, async (request) => {
    const query = ListFilesQuerySchema.parse(request.query ?? {});
    const fs = await context(request);
    const { entries } = await fs.listDir(query.path);
    return {
      entries: entries.map((e) =>
        WorkspaceEntrySchema.parse({
          name: e.name,
          path: e.path,
          kind: e.kind,
          ...(e.size !== undefined ? { size: e.size } : {}),
          ...(e.modifiedAt !== undefined ? { modifiedAt: e.modifiedAt } : {}),
        }),
      ),
    };
  });

  app.get("/api/v1/workspaces/:workspaceId/file", authed, async (request) => {
    const query = ReadFileQuerySchema.parse(request.query);
    const fs = await context(request);
    const file = await fs.readFile(query.path);
    if (file.isBinary) {
      throw AppError.badRequest(
        "BINARY_FILE",
        "Binary files cannot be edited as text",
      );
    }
    return {
      path: file.path,
      content: file.content.toString("utf8"),
      revision: file.revision,
      size: file.size,
      isBinary: false,
    };
  });

  app.put("/api/v1/workspaces/:workspaceId/file", authed, async (request) => {
    const body = WriteFileRequestSchema.parse(request.body);
    const fs = await context(request);
    const result = await fs.writeFile(body.path, body.content, {
      ...(body.expectedRevision !== undefined
        ? { expectedRevision: body.expectedRevision }
        : {}),
    });
    return result;
  });

  app.post("/api/v1/workspaces/:workspaceId/files", authed, async (request, reply) => {
    const body = CreateEntryRequestSchema.parse(request.body);
    const fs = await context(request);
    if (body.kind === "directory") {
      const result = await fs.mkdirEntry(body.path);
      return reply.status(201).send(result);
    }
    const result = await fs.writeFile(body.path, "", {});
    return reply.status(201).send(result);
  });

  app.patch("/api/v1/workspaces/:workspaceId/files", authed, async (request) => {
    const body = RenameEntryRequestSchema.parse(request.body);
    const fs = await context(request);
    return fs.renameEntry(body.from, body.to);
  });

  app.delete("/api/v1/workspaces/:workspaceId/files", authed, async (request, reply) => {
    const query = DeleteEntryQuerySchema.parse(request.query);
    const fs = await context(request);
    await fs.deleteEntry(query.path);
    return reply.status(204).send();
  });

  app.post("/api/v1/workspaces/:workspaceId/upload", authed, async (request, reply) => {
    const fs = await context(request);
    const parts = request.parts();
    let targetPath: string | null = null;
    let fileBuffer: Buffer | null = null;
    let fileCount = 0;

    for await (const part of parts) {
      if (part.type === "file") {
        fileCount += 1;
        if (fileCount > 1) {
          throw AppError.badRequest("MULTI_FILE", "Only one file per upload");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of part.file) {
          const buf = chunk as Buffer;
          size += buf.length;
          if (size > LIMITS.MAX_UPLOAD_BYTES) {
            throw AppError.tooMany("UPLOAD_TOO_LARGE", "Upload exceeds 10 MiB limit");
          }
          chunks.push(buf);
        }
        fileBuffer = Buffer.concat(chunks);
      } else if (part.fieldname === "path") {
        targetPath = String(part.value);
      }
      // Other field parts arrive fully buffered; ignore them.
    }

    if (!targetPath || fileBuffer === null) {
      throw AppError.badRequest("INVALID_UPLOAD", "Upload requires 'path' field and a file");
    }
    const result = await fs.writeFile(targetPath, fileBuffer, {
      maxBytes: LIMITS.MAX_UPLOAD_BYTES,
    });
    return reply.status(201).send(result);
  });

  app.get("/api/v1/workspaces/:workspaceId/download", authed, async (request, reply) => {
    const query = ReadFileQuerySchema.parse(request.query);
    const fs = await context(request);
    const file = await fs.readFile(query.path);
    const name = query.path.split("/").pop() ?? "download";
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Length", file.size);
    return reply.send(file.content);
  });
}
