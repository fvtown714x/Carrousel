import { PrismaClient } from "@prisma/client";

declare global {
  // evita recriar Prisma no dev (hot reload)
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Configure a PostgreSQL connection string.");
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  }
  prisma = global.__prisma;
}

export { prisma };
export default prisma; 