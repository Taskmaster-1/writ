/** What a tool can do to the world outside the agent. */
export type Effect = "read" | "write" | "send" | "destructive";

export const EFFECTS: readonly Effect[] = ["read", "write", "send", "destructive"];

/** What happens to a call: run it, wait for a person, or refuse it outright. */
export type Decision = "allow" | "ask" | "block";

export type MatcherOp =
  | "equals"
  | "notEquals"
  | "in"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "allEndWith"
  | "matches"
  | "exists";

/** A test on one argument of a call, addressed by a dot path (`repo`, `issue.labels`). */
export interface Matcher {
  path: string;
  op: MatcherOp;
  value?: unknown;
}

export interface Rule {
  id: string;
  /** Glob over the exposed tool name, e.g. `github__*` or `*__delete_*`. */
  tool: string;
  /** Glob over the agent name. Omitted means every agent. */
  agent?: string | null;
  decision: Decision;
  /** Every matcher must hold. Omitted or empty means the rule always applies. */
  when?: Matcher[] | null;
  note?: string | null;
}

export type Defaults = Record<Effect, Decision>;

export const DEFAULTS: Defaults = {
  read: "allow",
  write: "ask",
  send: "ask",
  destructive: "ask",
};

/** Everything the policy needs to know about one call. */
export interface CallFacts {
  tool: string;
  agent: string;
  effect: Effect;
  args: unknown;
  /** The session has read third-party content through Writ. */
  tainted: boolean;
}

export interface Verdict {
  decision: Decision;
  /** One sentence a person (and the agent) can read. */
  reason: string;
  /** The rule that decided, or null for a default. */
  ruleId: string | null;
}
