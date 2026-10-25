import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ToolAnnotations } from "./naming";

export interface UpstreamConfig {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  /** Changes whenever the config changes; a new version gets a fresh connection. */
  version: string;
}

export interface UpstreamTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

export interface ToolResult {
  content: { type: string; [key: string]: unknown }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface Entry {
  version: string;
  client: Promise<Client>;
  tools?: { at: number; list: UpstreamTool[] };
}

const TOOLS_TTL_MS = 60_000;

/**
 * Long-lived connections to upstream MCP servers, shared by every agent session. A failed
 * connection is dropped so the next use reconnects.
 */
export class UpstreamPool {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly options: {
      clientName: string;
      clientVersion: string;
      /** Test hook: how to reach upstreams. Defaults to global fetch. */
      fetch?: typeof fetch;
    },
  ) {}

  private entry(cfg: UpstreamConfig): Entry {
    const existing = this.entries.get(cfg.id);
    if (existing && existing.version === cfg.version) return existing;
    if (existing) void existing.client.then((c) => c.close()).catch(() => {});
    const entry: Entry = { version: cfg.version, client: this.connect(cfg) };
    entry.client.catch(() => {
      if (this.entries.get(cfg.id) === entry) this.entries.delete(cfg.id);
    });
    this.entries.set(cfg.id, entry);
    return entry;
  }

  private async connect(cfg: UpstreamConfig): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers: cfg.headers },
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
    const client = new Client({
      name: this.options.clientName,
      version: this.options.clientVersion,
    });
    await client.connect(transport, { timeout: 15_000 });
    return client;
  }

  /** The upstream's tools, cached for a minute. */
  async tools(cfg: UpstreamConfig, { fresh = false } = {}): Promise<UpstreamTool[]> {
    const entry = this.entry(cfg);
    if (!fresh && entry.tools && Date.now() - entry.tools.at < TOOLS_TTL_MS)
      return entry.tools.list;
    try {
      const list: UpstreamTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await (await entry.client).listTools(cursor ? { cursor } : undefined);
        list.push(...(page.tools as UpstreamTool[]));
        cursor = page.nextCursor;
      } while (cursor);
      entry.tools = { at: Date.now(), list };
      return list;
    } catch (error) {
      this.drop(cfg.id);
      throw error;
    }
  }

  async call(
    cfg: UpstreamConfig,
    name: string,
    args: Record<string, unknown>,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<ToolResult> {
    const client = await this.entry(cfg).client;
    try {
      return (await client.callTool({ name, arguments: args }, undefined, {
        ...(options.signal ? { signal: options.signal } : {}),
        timeout: options.timeoutMs ?? 120_000,
      })) as ToolResult;
    } catch (error) {
      // A broken connection fails every later call; reconnect next time.
      if (!options.signal?.aborted) this.drop(cfg.id);
      throw error;
    }
  }

  drop(id: string) {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    if (entry) void entry.client.then((c) => c.close()).catch(() => {});
  }

  async close() {
    const all = [...this.entries.values()];
    this.entries.clear();
    await Promise.allSettled(all.map(async (e) => (await e.client).close()));
  }
}
