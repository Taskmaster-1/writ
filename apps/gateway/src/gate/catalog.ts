import type { Effect } from "@writ/policy";
import { type Database, type Secrets, schema } from "@writ/store";
import {
  effectOf,
  exposedName,
  type UpstreamConfig,
  type UpstreamPool,
  type UpstreamTool,
  upstreamOf,
} from "@writ/upstream";
import { and, eq } from "drizzle-orm";

export type Upstream = typeof schema.upstreams.$inferSelect;

export interface CatalogTool {
  /** Name agents call. */
  exposed: string;
  upstream: Upstream;
  config: UpstreamConfig;
  tool: UpstreamTool;
  effect: Effect;
}

/** Upstream rows as connection configs, with credentials unsealed. */
export async function upstreamConfig(secrets: Secrets, row: Upstream): Promise<UpstreamConfig> {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    headers: row.headers
      ? (JSON.parse(await secrets.open(row.headers)) as Record<string, string>)
      : {},
    // Only what affects the connection; status updates must not force a reconnect.
    version: `${row.url}|${row.headers ?? ""}`,
  };
}

/** The tools agents can see: every enabled upstream's tools, renamed and labelled by effect. */
export class Catalog {
  constructor(
    private readonly database: Database,
    private readonly secrets: Secrets,
    private readonly pool: UpstreamPool,
  ) {}

  private async enabled(name?: string): Promise<Upstream[]> {
    return this.database.db
      .select()
      .from(schema.upstreams)
      .where(
        and(eq(schema.upstreams.enabled, true), ...(name ? [eq(schema.upstreams.name, name)] : [])),
      );
  }

  /** Tools of one upstream. Records whether the upstream answered. */
  async toolsOf(row: Upstream, options: { fresh?: boolean } = {}): Promise<CatalogTool[]> {
    const config = await upstreamConfig(this.secrets, row);
    try {
      const tools = await this.pool.tools(config, options);
      if (row.status !== "ok") await this.mark(row.id, null);
      return tools.map((tool) => ({
        exposed: exposedName(row.name, tool.name),
        upstream: row,
        config,
        tool,
        effect: effectOf(tool, row.toolEffects),
      }));
    } catch (error) {
      await this.mark(row.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Every tool from every enabled upstream. Upstreams that fail are left out. */
  async list(): Promise<CatalogTool[]> {
    const rows = await this.enabled();
    const lists = await Promise.all(rows.map((r) => this.toolsOf(r).catch(() => [])));
    return lists.flat().sort((a, b) => a.exposed.localeCompare(b.exposed));
  }

  /** The tool behind an exposed name, or null when there is none. */
  async resolve(exposed: string): Promise<CatalogTool | null> {
    const name = upstreamOf(exposed);
    if (!name) return null;
    const [row] = await this.enabled(name);
    if (!row) return null;
    return (await this.toolsOf(row)).find((t) => t.exposed === exposed) ?? null;
  }

  private async mark(id: string, error: string | null) {
    await this.database.db
      .update(schema.upstreams)
      .set({ status: error ? "error" : "ok", lastError: error })
      .where(eq(schema.upstreams.id, id));
  }
}
