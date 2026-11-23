import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  RUNNER_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  RUNNER_HOST: z.string().default("127.0.0.1"),
  RUNNER_SHARED_SECRET: z.string().min(32),

  /** Host path that contains per-workspace directories keyed by storageKey. */
  WORKSPACE_STORAGE_ROOT: z.string().min(1),

  /** Optional OCI runtime override (e.g. "runsc", "kata"). Empty = runc. */
  SANDBOX_OCI_RUNTIME: z.string().default(""),

  REDIS_URL: z.string().min(1),
});

export type RunnerEnv = z.infer<typeof EnvSchema> & { isProduction: boolean };

export function loadRunnerEnv(source: NodeJS.ProcessEnv = process.env): RunnerEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid runner environment:\n${issues}`);
  }
  return { ...parsed.data, isProduction: parsed.data.NODE_ENV === "production" };
}
