# Security

Writ is a security boundary between agents and tools, so we treat its bugs that way.

**Reporting:** please use GitHub's private vulnerability reporting on this repository
(Security → Report a vulnerability). Don't open a public issue for anything exploitable.

## Threat model, in short

| Threat | What Writ does |
|---|---|
| Prompt injection in content an agent reads | Sessions are tainted when they read output from an untrusted upstream; after that only reads run without a person. Strict mode taints every session from the start. |
| A stolen agent token | Tokens are random 256-bit values stored only as SHA-256 hashes, can be rotated or revoked at once (live sessions end immediately), and every call is attributed to the agent in the audit log. |
| Upstream credential theft | Upstream headers are sealed with AES-256-GCM (key derived from `WRIT_SECRET`) and never returned by the API. Agents never see them. |
| Approving something other than what runs | The approver sees the exact arguments. If they edit them, the edited arguments are what runs. An approval is bound to the agent, tool and canonical hash of the arguments, and is used once. |
| Double execution | Approved calls are claimed with a compare-and-set, so two retries can't both run one approval. |
| Cross-site requests to the console API or /mcp | Writes require the console's own origin; `/mcp` refuses any browser origin other than the console's (DNS rebinding). |
| Mislabelled tools | MCP annotations are treated as claims; a tool that declares nothing is destructive; admins can override any tool's effect. |

## Known limits

Writ only governs calls that pass through it. See "Honest limits" in the README.
