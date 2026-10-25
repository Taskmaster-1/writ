import { type Database, openDatabase, Secrets } from "@writ/store";
import { UpstreamPool as Pool, type UpstreamPool } from "@writ/upstream";
import { type Auth, createAuth } from "./auth";
import type { Config } from "./config";
import { CallBus } from "./gate/bus";
import { Catalog } from "./gate/catalog";
import { expireStale } from "./gate/decisions";
import { Gatekeeper } from "./gate/gatekeeper";

export interface Services {
  config: Config;
  database: Database;
  secrets: Secrets;
  auth: Auth;
  pool: UpstreamPool;
  bus: CallBus;
  catalog: Catalog;
  gatekeeper: Gatekeeper;
  close(): Promise<void>;
}

export async function createServices(
  config: Config,
  /** Test hook: how the gateway reaches upstream MCP servers. */
  upstreamFetch?: typeof fetch,
): Promise<Services> {
  const database = await openDatabase(config.DATABASE_URL);
  await database.migrate();
  const secrets = await Secrets.fromSecret(config.secret);
  const pool = new Pool({
    clientName: "writ",
    clientVersion: "0.1.0",
    ...(upstreamFetch ? { fetch: upstreamFetch } : {}),
  });
  const { bus, stop } = await CallBus.start(database);
  const catalog = new Catalog(database, secrets, pool);
  const gatekeeper = new Gatekeeper({
    database,
    catalog,
    pool,
    bus,
    waitMs: config.WRIT_APPROVAL_WAIT_SECONDS * 1000,
    ttlMs: config.WRIT_APPROVAL_TTL_HOURS * 3_600_000,
  });
  const expiry = setInterval(() => void expireStale(database, bus).catch(() => {}), 60_000);
  return {
    config,
    database,
    secrets,
    auth: createAuth(database.db, config),
    pool,
    bus,
    catalog,
    gatekeeper,
    close: async () => {
      clearInterval(expiry);
      await pool.close();
      await stop();
      await database.close();
    },
  };
}
