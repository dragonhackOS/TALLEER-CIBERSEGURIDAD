import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Configuración de Prisma 7 (cliente sin motor Rust + adaptador `pg`).
 * DATABASE_URL solo es necesaria para comandos de migración; `prisma generate`
 * funciona sin ella (p. ej. durante `docker build`).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
