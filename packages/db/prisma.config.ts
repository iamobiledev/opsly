import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://opsly:opsly@localhost:5432/opsly?schema=public"
  }
});
