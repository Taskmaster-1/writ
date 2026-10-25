# 1. Writ is a gateway, not an agent

**Status:** accepted

Writ does not run a model. It governs the tool calls of agents that already exist (Claude Code,
Cursor, ChatGPT, in-house agents) by standing between them and the tools.

**Why:** agents are multiplying and each one ships its own permission system that only covers
itself. A company running several needs one place to say what any agent may do, see what every
agent did, and sign off on what matters. That place cannot be one of the agents.

**Consequences:** the integration point is the protocol agents already speak (MCP). Writ must be
invisible when a call is allowed (low latency, faithful proxying) and clear when it is not (the
agent gets a reason it can act on).
