import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().default("127.0.0.1"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  RUNNER_SHARED_SECRET: z
    .string()
    .min(32, "RUNNER_SHARED_SECRET must be at least 32 characters"),

  WORKSPACE_STORAGE_ROOT: z.string().min(1).default("./.local-data/workspaces"),
});

export type AppEnv = z.infer<typeof EnvSchema> & { isProduction: boolean };

const PLACEHOLDER_MARKERS = ["change-me", "changeme", "secret", "password"];

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    for (const key of ["SESSION_SECRET", "RUNNER_SHARED_SECRET"] as const) {
      const value = env[key].toLowerCase();
      if (PLACEHOLDER_MARKERS.some((m) => value.includes(m))) {
        throw new Error(
          `Refusing to start in production: ${key} appears to be a placeholder secret.`,
        );
      }
    }
  }

  return { ...env, isProduction: env.NODE_ENV === "production" };
}
