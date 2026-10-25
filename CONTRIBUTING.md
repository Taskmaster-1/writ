# Contributing

Thanks for helping. A few things keep Writ easy to work on:

1. **Read [ARCHITECTURE.md](ARCHITECTURE.md) first.** It explains what each package owns and the
   rules for where code goes.
2. **Tests next to code.** Policy changes need unit tests in `packages/policy`; anything a call
   goes through needs an end-to-end test in `apps/gateway/src/gateway.test.ts` (it runs a real
   MCP client against a real MCP server, with Postgres in memory).
3. **Before a PR:** `bun run lint && bun run typecheck && bun test`.
4. **Schema changes:** edit `packages/store/src/schema.ts`, then `bun run db:generate`, and commit
   the migration.
5. **Big decisions** (a new dependency, a change to how calls are decided, a new storage
   concept) get a short record in `docs/decisions/`.
