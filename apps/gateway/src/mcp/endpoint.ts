import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { schema } from "@writ/store";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";
import { bearer, hashToken } from "../agents/tokens";
import type { AppEnv } from "../http";
import type { Services } from "../services";
import { type AgentIdentity, sessionServer } from "./server";

interface Live {
  transport: WebStandardStreamableHTTPServerTransport;
  agentId: string;
  lastUsed: number;
}

const IDLE_MS = 60 * 60_000;

const jsonRpcError = (status: number, message: string) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status });

/**
 * `/mcp`: the one URL agents connect to. Every request carries the agent's bearer token; each
 * MCP session belongs to the agent that opened it.
 */
export class McpEndpoint {
  private readonly sessions = new Map<string, Live>();
  private readonly sweeper: Timer;

  constructor(private readonly s: Services) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
  }

  handle = async (c: Context<AppEnv>): Promise<Response> => {
    const agent = await this.authenticate(c.req.header("authorization"));
    if (!agent)
      return Response.json(
        { error: "A valid Writ agent token is required (Authorization: Bearer writ_…)." },
        { status: 401, headers: { "www-authenticate": 'Bearer realm="writ"' } },
      );

    const id = c.req.header("mcp-session-id");
    if (id) {
      const live = this.sessions.get(id);
      if (!live || live.agentId !== agent.id) return jsonRpcError(404, "Session not found.");
      live.lastUsed = Date.now();
      return live.transport.handleRequest(c.req.raw);
    }
    if (c.req.method !== "POST")
      return jsonRpcError(400, "Start a session with an initialize request.");
    return this.open(agent, c.req.raw);
  };

  private async open(agent: AgentIdentity, request: Request): Promise<Response> {
    const { database, catalog, gatekeeper } = this.s;
    const server = sessionServer({ agent, catalog, gatekeeper });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: async (sessionId) => {
        this.sessions.set(sessionId, { transport, agentId: agent.id, lastUsed: Date.now() });
        const client = server.getClientVersion();
        await database.db.insert(schema.agentSessions).values({
          id: sessionId,
          agentId: agent.id,
          client: client ? `${client.name} ${client.version}` : null,
        });
      },
      onsessionclosed: (sessionId) => {
        this.sessions.delete(sessionId);
      },
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  }

  private async authenticate(header: string | undefined): Promise<AgentIdentity | null> {
    const token = bearer(header);
    if (!token) return null;
    const [agent] = await this.s.database.db
      .select({
        id: schema.agents.id,
        name: schema.agents.name,
        lastSeenAt: schema.agents.lastSeenAt,
      })
      .from(schema.agents)
      .where(and(eq(schema.agents.tokenHash, hashToken(token)), isNull(schema.agents.revokedAt)));
    if (!agent) return null;
    if (!agent.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() > 60_000)
      await this.s.database.db
        .update(schema.agents)
        .set({ lastSeenAt: sql`now()` })
        .where(eq(schema.agents.id, agent.id));
    return { id: agent.id, name: agent.name };
  }

  /** Ends sessions of a revoked agent at once, not at their next request. */
  dropAgent(agentId: string) {
    for (const [id, live] of this.sessions)
      if (live.agentId === agentId) {
        this.sessions.delete(id);
        void live.transport.close();
      }
  }

  private sweep() {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, live] of this.sessions)
      if (live.lastUsed < cutoff) {
        this.sessions.delete(id);
        void live.transport.close();
      }
  }

  async close() {
    clearInterval(this.sweeper);
    await Promise.allSettled([...this.sessions.values()].map((l) => l.transport.close()));
    this.sessions.clear();
  }
}
