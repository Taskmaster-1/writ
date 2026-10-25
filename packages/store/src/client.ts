import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  kind: "postgres" | "pglite";
  /** Postgres LISTEN/NOTIFY, so several gateway instances see each other's decisions. */
  listen(channel: string, onPayload: (payload: string) => void): Promise<() => Promise<void>>;
  notify(channel: string, payload: string): Promise<void>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/**
 * `postgres://…` connects to Postgres. `pglite://<dir>` or `pglite://memory` runs Postgres
 * in-process (WebAssembly): no setup, one process only. Fine to try Writ; use Postgres for
 * anything shared.
 */
export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith("pglite://")) {
    const path = url.slice("pglite://".length);
    if (path !== "memory") mkdirSync(path, { recursive: true });
    const client = await PGlite.create(path === "memory" ? {} : { dataDir: path });
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    return {
      db,
      kind: "pglite",
      listen: async (channel, fn) => {
        const unsubscribe = await client.listen(channel, fn);
        return async () => unsubscribe();
      },
      notify: async (channel, payload) => {
        await client.query("select pg_notify($1, $2)", [channel, payload]);
      },
      migrate: () => migratePglite(drizzlePglite(client), { migrationsFolder }),
      close: () => client.close(),
    };
  }

  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    onnotice: () => {},
  });
  const db = drizzlePostgres(sql, { schema }) as unknown as Db;
  return {
    db,
    kind: "postgres",
    listen: async (channel, fn) => {
      const sub = await sql.listen(channel, fn);
      return () => sub.unlisten();
    },
    notify: async (channel, payload) => {
      await sql.notify(channel, payload);
    },
    migrate: () => migratePostgres(drizzlePostgres(sql), { migrationsFolder }),
    close: () => sql.end(),
  };
}
