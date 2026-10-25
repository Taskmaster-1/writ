import type { CallStatus, Database } from "@writ/store";

export const CALLS_CHANNEL = "writ_calls";

export interface CallChange {
  id: string;
  status: CallStatus;
}

/**
 * Fans out call status changes. Changes go through Postgres NOTIFY, so a decision made on one
 * gateway instance wakes the agent request held open on another.
 */
export class CallBus {
  private readonly byCall = new Map<string, Set<(c: CallChange) => void>>();
  private readonly all = new Set<(c: CallChange) => void>();

  private constructor(private readonly database: Database) {}

  static async start(database: Database): Promise<{ bus: CallBus; stop: () => Promise<void> }> {
    const bus = new CallBus(database);
    const stop = await database.listen(CALLS_CHANNEL, (payload) => {
      let change: CallChange;
      try {
        change = JSON.parse(payload) as CallChange;
      } catch {
        return;
      }
      for (const fn of bus.byCall.get(change.id) ?? []) fn(change);
      for (const fn of bus.all) fn(change);
    });
    return { bus, stop };
  }

  publish(change: CallChange): Promise<void> {
    return this.database.notify(CALLS_CHANNEL, JSON.stringify(change));
  }

  /** Every change, for the console's live view. */
  subscribeAll(fn: (c: CallChange) => void): () => void {
    this.all.add(fn);
    return () => this.all.delete(fn);
  }

  /** Resolves on the next change to one call, or with null on timeout or abort. */
  next(id: string, timeoutMs: number, signal?: AbortSignal): Promise<CallChange | null> {
    return new Promise((resolve) => {
      let set = this.byCall.get(id);
      if (!set) {
        set = new Set();
        this.byCall.set(id, set);
      }
      const done = (change: CallChange | null) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        set.delete(onChange);
        if (set.size === 0) this.byCall.delete(id);
        resolve(change);
      };
      const onChange = (c: CallChange) => done(c);
      const onAbort = () => done(null);
      const timer = setTimeout(() => done(null), timeoutMs);
      set.add(onChange);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
