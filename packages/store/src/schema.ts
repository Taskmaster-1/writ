import type { Decision, Defaults, Effect, Matcher } from "@writ/policy";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ── People (Better Auth core tables) ──────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Agents ─────────────────────────────────────────────────────────────────

/** Something that calls tools through Writ. Identified by a bearer token. */
export const agents = pgTable(
  "agents",
  {
    id: id(),
    /** Lowercase slug; rules match on it (`claude-code`, `release-bot`). */
    name: text("name").notNull(),
    description: text("description"),
    /** SHA-256 of the token. The token itself is shown once, at creation. */
    tokenHash: text("token_hash").notNull(),
    /** First characters of the token, so people can tell tokens apart. */
    tokenHint: text("token_hint").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agents_name_idx").on(t.name),
    uniqueIndex("agents_token_hash_idx").on(t.tokenHash),
  ],
);

// ── Upstreams ──────────────────────────────────────────────────────────────

/** A real MCP server whose tools Writ re-exposes to agents. */
export const upstreams = pgTable(
  "upstreams",
  {
    id: id(),
    /** Lowercase slug; prefixes the tool names agents see (`github__create_issue`). */
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Sealed JSON of extra request headers (usually Authorization). */
    headers: text("headers"),
    /** Output from a trusted upstream does not taint a session. */
    trusted: boolean("trusted").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    /** Per-tool effect overrides, by upstream tool name. */
    toolEffects: jsonb("tool_effects").$type<Record<string, Effect>>().notNull().default({}),
    status: text("status").$type<"ok" | "error" | "unknown">().notNull().default("unknown"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("upstreams_name_idx").on(t.name)],
);

// ── Policy ─────────────────────────────────────────────────────────────────

export const rules = pgTable(
  "rules",
  {
    id: id(),
    position: integer("position").notNull(),
    tool: text("tool").notNull(),
    agent: text("agent"),
    decision: text("decision").$type<Decision>().notNull(),
    when: jsonb("when").$type<Matcher[]>(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("rules_position_idx").on(t.position)],
);

/** Install-wide settings. A single row with id "default". */
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  defaults: jsonb("defaults").$type<Defaults>(),
  /** Treat every session as tainted from its first call. */
  strictTaint: boolean("strict_taint").notNull().default(false),
  updatedAt: updatedAt(),
});

// ── Activity ───────────────────────────────────────────────────────────────

/** One MCP session of one agent. Taint lives here. */
export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Client name and version from the MCP handshake, e.g. "claude-code 2.1.0". */
    client: text("client"),
    tainted: boolean("tainted").notNull().default(false),
    /** The call whose output tainted the session. */
    taintedBy: text("tainted_by"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_sessions_agent_idx").on(t.agentId, t.createdAt)],
);

export type CallStatus =
  /** Waiting for a person. */
  | "pending"
  /** Approved, not yet executed. */
  | "approved"
  | "denied"
  | "blocked"
  /** Nobody decided before the approval expired. */
  | "expired"
  | "running"
  | "succeeded"
  | "failed";

/** Every tool call an agent made through Writ, and what happened to it. */
export const calls = pgTable(
  "calls",
  {
    id: id(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    upstreamId: text("upstream_id").references(() => upstreams.id, { onDelete: "set null" }),
    /** Name the agent called (`github__create_issue`). */
    tool: text("tool").notNull(),
    /** Name on the upstream (`create_issue`). */
    upstreamTool: text("upstream_tool").notNull(),
    effect: text("effect").$type<Effect>().notNull(),
    args: jsonb("args").notNull(),
    /** Hash of canonical args; a retry with the same hash reuses this call's approval. */
    argsHash: text("args_hash").notNull(),
    /** Arguments as approved, when the approver edited them. */
    approvedArgs: jsonb("approved_args"),
    decision: text("decision").$type<Decision>().notNull(),
    reason: text("reason").notNull(),
    ruleId: text("rule_id"),
    tainted: boolean("tainted").notNull().default(false),
    status: text("status").$type<CallStatus>().notNull(),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** The approver's note; for denials it is passed to the agent. */
    decisionNote: text("decision_note"),
    /** First part of the result, for the audit log. */
    output: text("output"),
    isError: boolean("is_error").notNull().default(false),
    durationMs: integer("duration_ms"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("calls_created_idx").on(t.createdAt),
    index("calls_agent_idx").on(t.agentId, t.createdAt),
    index("calls_pending_idx").on(t.createdAt).where(sql`status = 'pending'`),
    index("calls_retry_idx").on(t.agentId, t.tool, t.argsHash),
  ],
);
