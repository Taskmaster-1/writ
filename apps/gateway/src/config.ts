import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(8790),
  /** postgres://… or pglite://<dir> (embedded, one process). */
  DATABASE_URL: z.string().default("pglite://.data/pglite"),
  /** Encrypts upstream credentials and signs console sessions. At least 32 characters. */
  WRIT_SECRET: z.string().min(32).optional(),
  /** The URL people open the console at. The console proxies /api and /mcp here. */
  PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  /** The first account can always be created; after that only when this is true. */
  ALLOW_SIGNUP: flag,
  /** How long a call needing approval is held open before the agent is told to retry. */
  WRIT_APPROVAL_WAIT_SECONDS: z.coerce.number().int().min(1).max(240).default(120),
  /** How long a pending or approved call stays valid. */
  WRIT_APPROVAL_TTL_HOURS: z.coerce.number().min(0.01).default(24),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = Env.parse(env);
  return { ...parsed, secret: parsed.WRIT_SECRET ?? devSecret(parsed.NODE_ENV) };
}

/** Outside production, keep a random secret next to the embedded database. */
function devSecret(nodeEnv: string): string {
  if (nodeEnv === "production") throw new Error("WRIT_SECRET is required in production");
  const path = ".data/secret";
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  mkdirSync(dirname(path), { recursive: true });
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
}
