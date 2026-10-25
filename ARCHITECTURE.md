# Architecture

Writ sits between AI agents and the tools they use. Agents connect to Writ as if it were one
MCP server; Writ connects to the real MCP servers ("upstreams") and decides, call by call,
whether each one runs now, waits for a person, or never runs.

```
 Claude Code ─┐                       ┌─▶ GitHub MCP
 Cursor ──────┼─▶  Writ gateway  ─────┼─▶ Linear MCP
 your agent ──┘   /mcp (one URL)      └─▶ any MCP server
                    │  policy → approval → call → audit
                    ▼
                 Postgres  ◀───  Writ console (approve, review, configure)
```

## The life of a tool call

1. An agent calls `tools/call` on `/mcp` with its token. The gateway knows which **agent** it
   is and which **session** (MCP session id) the call belongs to.
2. The tool name (`github__create_issue`) resolves to an **upstream** and its tool. The tool's
   **effect** (`read`, `write`, `send`, `destructive`) comes from the upstream's annotations,
   overridden by the admin per tool.
3. **Policy** (`packages/policy`, pure functions) returns `allow`, `ask` or `block`:
   - a matching `block` rule always wins;
   - otherwise the first matching `allow`/`ask` rule;
   - otherwise the default for the effect (read → allow, everything else → ask);
   - if the session is **tainted** (it has read third-party content through Writ), `allow`
     becomes `ask` for anything but reads.
4. `ask` creates a pending **call** and holds the request open while a person decides in the
   console. They can approve, approve with edited arguments, or deny with a reason the agent
   sees. If nobody decides in time, the agent is told the call is waiting; calling the tool
   again with the same arguments picks up the same approval instead of asking twice.
5. Allowed and approved calls are forwarded to the upstream. Every call, whatever happened to
   it, is one row in the audit log.

## Repository layout

| Path | What it owns | Depends on |
|---|---|---|
| `packages/policy` | Effects, rules, matchers, taint, the decision function. Pure, no I/O. | nothing |
| `packages/store` | Postgres schema and migrations (Drizzle), the database client (Postgres or embedded PGlite), secret encryption. | `policy` (types) |
| `packages/upstream` | MCP client side: connecting to upstream servers, listing and calling their tools, naming and effects. | `policy` (types) |
| `apps/gateway` | The server: the `/mcp` endpoint agents connect to, the console's HTTP API, auth, approvals. | all packages |
| `apps/console` | The web UI (Next.js). Talks to the gateway's HTTP API only. | nothing at runtime |

Rules that keep it this way:

- Packages never import from apps. `policy` never does I/O.
- Each folder has one job. There is no `utils` or `helpers` dumping ground; a helper lives next
  to the only thing that uses it, or becomes a named module.
- Tests sit next to the code they test (`*.test.ts`).
- Files stay small enough to read in one sitting (about 300 lines).
- Big decisions are recorded in [`docs/decisions`](docs/decisions).
