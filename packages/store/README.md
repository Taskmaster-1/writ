# @writ/store

The database: Drizzle schema and migrations, a client for Postgres or embedded PGlite, and
encryption for secrets at rest.

| Table | Holds |
|---|---|
| `agents` | Things that call tools through Writ, with a hashed bearer token |
| `upstreams` | MCP servers Writ proxies, with sealed credentials and per-tool effect overrides |
| `rules`, `settings` | The policy |
| `agent_sessions` | One row per MCP session; taint lives here |
| `calls` | Every tool call and what happened to it: the approval queue and the audit log |
| `user`, `session`, `account`, `verification` | People who sign in to the console (Better Auth) |

After changing `src/schema.ts`, run `bun run db:generate` from the repo root and commit the new
migration in `drizzle/`.
