import { defineConfig } from "prisma/config";

export default defineConfig({
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    provider: "sqlite",
    url: "file:dev.sqlite",
  },
});
