import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // Signe les JWT de session Auth.js — 32 caractères minimum, jamais une valeur
  // par défaut devinable (voir DECISIONS.md, ADR-008).
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères."),
  AUTH_URL: z.string().url().optional(),
  // Couche IA additive (voir DECISIONS.md ADR-034/035) : toutes optionnelles — en
  // l'absence de l'une d'elles, les fonctionnalités IA se désactivent proprement,
  // le reste de l'application n'est jamais affecté.
  OLLAMA_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates process.env once at process startup. Fails fast with a
 * readable error instead of letting a missing/malformed variable surface as a
 * confusing runtime error deep in the request/job lifecycle.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
