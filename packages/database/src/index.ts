import { PrismaClient } from "@prisma/client";

export { PrismaClient };
export * from "./templates.js";

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
