import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "~~/server/generated/prisma/client";

// Next dev reloads modules on every edit; without the global cache each reload
// would open a fresh pool and exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "~~/server/generated/prisma/client";
