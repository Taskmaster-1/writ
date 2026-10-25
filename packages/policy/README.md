# @writ/policy

Decides what happens to one tool call: `allow`, `ask` or `block`. Pure functions, no I/O, no
dependencies, so the rules that guard every call can be read and tested in isolation.

```ts
import { DEFAULTS, evaluate } from "@writ/policy";

evaluate(
  { tool: "gmail__send", agent: "claude-code", effect: "send", args: { to: ["bob@acme.com"] }, tainted: false },
  [{ id: "r1", tool: "gmail__send", decision: "allow", when: [{ path: "to", op: "allEndWith", value: ["@acme.com"] }] }],
  DEFAULTS,
); // { decision: "allow", reason: 'Decided by rule "gmail__send".', ruleId: "r1" }
```

Order of precedence: any matching `block` rule, then the first matching rule, then the default
for the effect. A tainted session never auto-allows anything but reads.
