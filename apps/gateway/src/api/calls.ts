import type { CallStatus } from "@writ/store";
import { schema } from "@writ/store";
import { and, count, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { DecisionError, decide } from "../gate/decisions";
import { type AppEnv, fail, readBody } from "../http";

const STATUSES: CallStatus[] = [
  "pending",
  "approved",
  "denied",
  "blocked",
  "expired",
  "running",
  "succeeded",
  "failed",
];

const columns = {
  id: schema.calls.id,
  agent: schema.agents.name,
  agentId: schema.calls.agentId,
  sessionId: schema.calls.sessionId,
  tool: schema.calls.tool,
  upstream: schema.upstreams.name,
  effect: schema.calls.effect,
  args: schema.calls.args,
  approvedArgs: schema.calls.approvedArgs,
  decision: schema.calls.decision,
  reason: schema.calls.reason,
  tainted: schema.calls.tainted,
  status: schema.calls.status,
  decidedBy: schema.user.name,
  decidedAt: schema.calls.decidedAt,
  decisionNote: schema.calls.decisionNote,
  output: schema.calls.output,
  isError: schema.calls.isError,
  durationMs: schema.calls.durationMs,
  expiresAt: schema.calls.expiresAt,
  createdAt: schema.calls.createdAt,
  finishedAt: schema.calls.finishedAt,
};

function query(c: { var: AppEnv["Variables"] }) {
  return c.var.services.database.db
    .select(columns)
    .from(schema.calls)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.calls.agentId))
    .leftJoin(schema.upstreams, eq(schema.upstreams.id, schema.calls.upstreamId))
    .leftJoin(schema.user, eq(schema.user.id, schema.calls.decidedBy));
}

const Decide = z.object({
  note: z.string().trim().max(1000).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});

/** The approval queue and the audit log: both are views of `calls`. */
export const calls = new Hono<AppEnv>()
  .get("/", async (c) => {
    const status = c.req
      .query("status")
      ?.split(",")
      .filter((s): s is CallStatus => STATUSES.includes(s as CallStatus));
    const agent = c.req.query("agent");
    const before = c.req.query("before");
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const where: SQL[] = [];
    if (status?.length) where.push(inArray(schema.calls.status, status));
    if (agent) where.push(eq(schema.agents.name, agent));
    if (before) where.push(lt(schema.calls.createdAt, new Date(before)));
    const rows = await query(c)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(schema.calls.createdAt))
      .limit(limit);
    return c.json({ calls: rows });
  })

  .get("/summary", async (c) => {
    const { db } = c.var.services.database;
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [[pending], byStatus] = await Promise.all([
      db.select({ n: count() }).from(schema.calls).where(eq(schema.calls.status, "pending")),
      db
        .select({ status: schema.calls.status, n: count() })
        .from(schema.calls)
        .where(gte(schema.calls.createdAt, since))
        .groupBy(schema.calls.status),
    ]);
    return c.json({
      pending: pending?.n ?? 0,
      last24h: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    });
  })

  .get("/:id", async (c) => {
    const [row] = await query(c).where(eq(schema.calls.id, c.req.param("id")));
    if (!row) fail(404, "not_found", "No call with that id.");
    return c.json({ call: row });
  })

  .post("/:id/approve", async (c) => {
    const input = await readBody(c, Decide);
    return decision(c, { approve: true, note: input.note ?? null, editedArgs: input.args ?? null });
  })

  .post("/:id/deny", async (c) => {
    const input = await readBody(c, Decide.pick({ note: true }));
    return decision(c, { approve: false, note: input.note ?? null });
  })

  /** Live updates for the console: one event per status change of any call. */
  .get("/events/stream", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = c.var.services.bus.subscribeAll((change) => {
        void stream.writeSSE({ event: "call", data: JSON.stringify(change) });
      });
      stream.onAbort(unsubscribe);
      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(25_000);
      }
      unsubscribe();
    }),
  );

async function decision(
  c: Context<AppEnv>,
  args: { approve: boolean; note: string | null; editedArgs?: Record<string, unknown> | null },
) {
  try {
    await decide(c.var.services.database, c.var.services.bus, {
      callId: c.req.param("id") ?? "",
      userId: c.var.user.id,
      ...args,
    });
  } catch (error) {
    if (error instanceof DecisionError) fail(409, "conflict", error.message);
    throw error;
  }
  const [row] = await query(c).where(eq(schema.calls.id, c.req.param("id") ?? ""));
  return c.json({ call: row });
}
