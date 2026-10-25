import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Catalog } from "../gate/catalog";
import type { Gatekeeper } from "../gate/gatekeeper";

export interface AgentIdentity {
  id: string;
  name: string;
}

const INSTRUCTIONS = `Tools here are provided through Writ, which applies the user's approval rules. Some calls wait for a person to approve them; if a result says a call is waiting for approval, tell the user and call the tool again with the same arguments once they have approved it. If a call is denied or blocked, do not retry it in another form.`;

/** The MCP server one agent session talks to: the catalog, with every call going through the gate. */
export function sessionServer(deps: {
  agent: AgentIdentity;
  catalog: Catalog;
  gatekeeper: Gatekeeper;
}): Server {
  const server = new Server(
    { name: "writ", title: "Writ", version: "0.1.0" },
    { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await deps.catalog.list();
    return {
      tools: tools.map((t) => ({
        name: t.exposed,
        ...(t.tool.title ? { title: t.tool.title } : {}),
        description: `[${t.upstream.name}] ${t.tool.description ?? ""}`.trim(),
        inputSchema: t.tool.inputSchema as { type: "object" },
        ...(t.tool.outputSchema ? { outputSchema: t.tool.outputSchema as { type: "object" } } : {}),
        annotations: {
          ...t.tool.annotations,
          // Agents see the effect Writ enforces, not only what the upstream claimed.
          readOnlyHint: t.effect === "read",
          destructiveHint: t.effect === "destructive",
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const progressToken = request.params._meta?.progressToken;
    const result = await deps.gatekeeper.handle({
      agent: deps.agent,
      sessionId: extra.sessionId ?? null,
      tool: request.params.name,
      args: (request.params.arguments ?? {}) as Record<string, unknown>,
      signal: extra.signal,
      ...(progressToken !== undefined
        ? {
            onWait: (waitedMs) =>
              extra.sendNotification({
                method: "notifications/progress",
                params: {
                  progressToken,
                  progress: Math.round(waitedMs / 1000),
                  message: "Waiting for approval in Writ",
                },
              }),
          }
        : {}),
    });
    return result as { content: { type: "text"; text: string }[] };
  });

  return server;
}
