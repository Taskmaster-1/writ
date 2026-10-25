import { DEFAULTS, evaluate, type Rule } from "@writ/policy";
import { type Database, schema } from "@writ/store";
import type { ToolResult, UpstreamPool } from "@writ/upstream";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type { CallBus } from "./bus";
import type { Catalog, CatalogTool } from "./catalog";
import { argsHash } from "./hash";
import { message } from "./messages";

type Call = typeof schema.calls.$inferSelect;

export interface CallRequest {
  agent: { id: string; name: string };
  sessionId: string | null;
  tool: string;
  args: Record<string, unknown>;
  signal: AbortSignal;
  /** Called every few seconds while a call waits for a person (e.g. to send MCP progress). */
  onWait?: (waitedMs: number) => Promise<void>;
}

export interface GatekeeperOptions {
  database: Database;
  catalog: Catalog;
  pool: UpstreamPool;
  bus: CallBus;
  /** How long to hold a call open for a decision before telling the agent to retry. */
  waitMs: number;
  /** How long a pending or approved call stays valid. */
  ttlMs: number;
}

const POLL_MS = 10_000;
const OUTPUT_CHARS = 4_000;

/**
 * Decides and runs one tool call: policy, then (if needed) a person, then the upstream. Every
 * call leaves exactly one row in `calls`, whatever happens to it.
 */
export class Gatekeeper {
  constructor(private readonly o: GatekeeperOptions) {}

  private get db() {
    return this.o.database.db;
  }

  async handle(req: CallRequest): Promise<ToolResult> {
    const target = await this.o.catalog.resolve(req.tool).catch(() => null);
    if (!target) return message.unknownTool(req.tool);

    const hash = argsHash(req.args);
    let call = (await this.retryOf(req, hash)) ?? (await this.open(req, target, hash));

    if (call.status === "blocked") return message.blocked(call.reason);
    if (call.status === "pending") {
      call = await this.awaitDecision(call, req);
      if (call.status === "pending") return message.waiting(call.id);
      if (call.status === "denied") return message.denied(call.decisionNote);
      if (call.status === "expired") return message.expired();
    }
    if (call.status === "approved") {
      const claimed = await this.claim(call.id);
      if (!claimed) return message.alreadyUsed();
      call = claimed;
    }
    const args = (call.approvedArgs as Record<string, unknown> | null) ?? req.args;
    return this.run(call, target, args, req);
  }

  /**
   * A call from the same agent, to the same tool, with the same arguments that is still
   * waiting or approved: a retry after "waiting for approval" picks up where it left off.
   */
  private async retryOf(req: CallRequest, hash: string): Promise<Call | null> {
    const [call] = await this.db
      .select()
      .from(schema.calls)
      .where(
        and(
          eq(schema.calls.agentId, req.agent.id),
          eq(schema.calls.tool, req.tool),
          eq(schema.calls.argsHash, hash),
          inArray(schema.calls.status, ["pending", "approved"]),
          gt(schema.calls.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.calls.createdAt))
      .limit(1);
    return call ?? null;
  }

  /** Decides a new call and records it. */
  private async open(req: CallRequest, target: CatalogTool, hash: string): Promise<Call> {
    const [settings] = await this.db.select().from(schema.settings);
    const rules = (await this.db
      .select()
      .from(schema.rules)
      .orderBy(asc(schema.rules.position))) as Rule[];
    const session = req.sessionId
      ? (
          await this.db
            .select({ tainted: schema.agentSessions.tainted })
            .from(schema.agentSessions)
            .where(eq(schema.agentSessions.id, req.sessionId))
        )[0]
      : undefined;
    const tainted = Boolean(settings?.strictTaint || session?.tainted);

    const verdict = evaluate(
      { tool: req.tool, agent: req.agent.name, effect: target.effect, args: req.args, tainted },
      rules,
      settings?.defaults ?? DEFAULTS,
    );
    const status =
      verdict.decision === "allow" ? "running" : verdict.decision === "ask" ? "pending" : "blocked";
    const [call] = await this.db
      .insert(schema.calls)
      .values({
        agentId: req.agent.id,
        sessionId: req.sessionId,
        upstreamId: target.upstream.id,
        tool: req.tool,
        upstreamTool: target.tool.name,
        effect: target.effect,
        args: req.args,
        argsHash: hash,
        decision: verdict.decision,
        reason: verdict.reason,
        ruleId: verdict.ruleId,
        tainted,
        status,
        expiresAt: status === "pending" ? new Date(Date.now() + this.o.ttlMs) : null,
        finishedAt: status === "blocked" ? new Date() : null,
      })
      .returning();
    await this.o.bus.publish({ id: call!.id, status });
    return call!;
  }

  /** Holds the request open until someone decides, the wait runs out, or the agent leaves. */
  private async awaitDecision(call: Call, req: CallRequest): Promise<Call> {
    const started = Date.now();
    let current = call;
    for (;;) {
      if (current.expiresAt && current.expiresAt.getTime() <= Date.now())
        return (await this.expire(current.id)) ?? (await this.reload(current.id));
      const left = this.o.waitMs - (Date.now() - started);
      if (left <= 0 || req.signal.aborted) return current;
      await this.o.bus.next(current.id, Math.min(left, POLL_MS), req.signal);
      current = await this.reload(current.id);
      if (current.status !== "pending") return current;
      await req.onWait?.(Date.now() - started).catch(() => {});
    }
  }

  private async reload(id: string): Promise<Call> {
    const [call] = await this.db.select().from(schema.calls).where(eq(schema.calls.id, id));
    return call!;
  }

  private async expire(id: string): Promise<Call | null> {
    const [call] = await this.db
      .update(schema.calls)
      .set({ status: "expired", finishedAt: new Date() })
      .where(and(eq(schema.calls.id, id), eq(schema.calls.status, "pending")))
      .returning();
    if (call) await this.o.bus.publish({ id, status: "expired" });
    return call ?? null;
  }

  /** Takes an approval for this request. Only one request can use it. */
  private async claim(id: string): Promise<Call | null> {
    const [call] = await this.db
      .update(schema.calls)
      .set({ status: "running" })
      .where(and(eq(schema.calls.id, id), eq(schema.calls.status, "approved")))
      .returning();
    return call ?? null;
  }

  private async run(
    call: Call,
    target: CatalogTool,
    args: Record<string, unknown>,
    req: CallRequest,
  ): Promise<ToolResult> {
    const started = Date.now();
    let result: ToolResult;
    try {
      result = await this.o.pool.call(target.config, target.tool.name, args, {
        signal: req.signal,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await this.finish(call.id, { output: text, isError: true, durationMs: Date.now() - started });
      return message.upstreamFailed(target.upstream.name, text);
    }
    const isError = result.isError === true;
    await this.finish(call.id, {
      output: summarize(result),
      isError,
      durationMs: Date.now() - started,
    });
    if (!isError && !target.upstream.trusted && req.sessionId)
      await this.taint(req.sessionId, call.id);
    return result;
  }

  private async finish(id: string, r: { output: string; isError: boolean; durationMs: number }) {
    const status = r.isError ? "failed" : "succeeded";
    await this.db
      .update(schema.calls)
      .set({ ...r, output: r.output.slice(0, OUTPUT_CHARS), status, finishedAt: new Date() })
      .where(eq(schema.calls.id, id));
    await this.o.bus.publish({ id, status });
  }

  /** Third-party content is now in the agent's context; remember that for the session. */
  private async taint(sessionId: string, callId: string) {
    await this.db
      .update(schema.agentSessions)
      .set({ tainted: true, taintedBy: callId })
      .where(and(eq(schema.agentSessions.id, sessionId), eq(schema.agentSessions.tainted, false)));
  }
}

/** The text of a result, for the audit log. */
function summarize(result: ToolResult): string {
  const text = result.content
    .map((part) => (part.type === "text" ? String(part.text ?? "") : `[${part.type}]`))
    .join("\n");
  if (text) return text;
  return result.structuredContent ? JSON.stringify(result.structuredContent) : "";
}
