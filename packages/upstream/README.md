# @writ/upstream

The client side of the proxy: long-lived connections to upstream MCP servers (Streamable HTTP),
their tool lists, and calls. Also the two naming rules every other part relies on:

- **Exposed names.** Agents see `<upstream>__<tool>`, e.g. `github__create_issue`.
- **Effects.** An admin override wins; otherwise MCP annotations (`readOnlyHint`,
  `destructiveHint`) decide, and a tool that claims nothing is treated as destructive.
