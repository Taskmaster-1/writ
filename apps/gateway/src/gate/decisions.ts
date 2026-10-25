import { type Database, schema } from "@writ/store";
import { and, eq, lte } from "drizzle-orm";
import type { CallBus } from "./bus";

export class DecisionError extends Error {}

/**
 * A person's answer to a pending call. Compare-and-set on status, so a double click or two
 * people deciding at once can't both win.
 */
export async function decide(
  database: Database,
  bus: CallBus,
  args: {
    callId: string;
    userId: string;
    approve: boolean;
    note?: string | null;
    /** Approve with these arguments instead of the agent's. */
    editedArgs?: Record<string, unknown> | null;
  },
) {
  const [call] = await database.db
    .update(schema.calls)
    .set({
      status: args.approve ? "approved" : "denied",
      decidedBy: args.userId,
      decidedAt: new Date(),
      decisionNote: args.note?.trim() || null,
      ...(args.approve && args.editedArgs ? { approvedArgs: args.editedArgs } : {}),
      ...(args.approve ? {} : { finishedAt: new Date() }),
    })
    .where(and(eq(schema.calls.id, args.callId), eq(schema.calls.status, "pending")))
    .returning();
  if (!call) throw new DecisionError("This call is no longer waiting for a decision.");
  await bus.publish({ id: call.id, status: call.status });
  return call;
}

/** Marks pending calls past their expiry as expired. Returns how many. */
export async function expireStale(database: Database, bus: CallBus, now = new Date()) {
  const expired = await database.db
    .update(schema.calls)
    .set({ status: "expired", finishedAt: now })
    .where(and(eq(schema.calls.status, "pending"), lte(schema.calls.expiresAt, now)))
    .returning({ id: schema.calls.id });
  for (const { id } of expired) await bus.publish({ id, status: "expired" });
  return expired.length;
}
