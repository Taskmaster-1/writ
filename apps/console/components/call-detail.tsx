import type { ReactNode } from "react";
import type { Call } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { ArgumentList } from "./approval-args";
import { DecisionBadge, EffectBadge, StatusBadge } from "./badges";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] text-fg">{children}</dd>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-fg">
      {children}
    </pre>
  );
}

/** What happened to a call, as one sentence a person can read without knowing the policy model. */
function outcome(call: Call): string {
  const by = call.decidedBy ?? "A person";
  switch (call.status) {
    case "pending":
      return "Waiting for someone to approve or deny it. Nothing has happened yet.";
    case "approved":
    case "running":
      return `${by} approved it, and it is running now.`;
    case "succeeded":
      return call.decidedBy
        ? `${by} approved it, and it ran.`
        : `It ran on its own: ${call.reason.charAt(0).toLowerCase()}${call.reason.slice(1)}`;
    case "failed":
      return "Writ let it through, but the tool itself returned an error.";
    case "denied":
      return `${by} denied it, so it never ran. The agent was told why.`;
    case "blocked":
      return `Writ blocked it, so it never ran. ${call.reason}`;
    case "expired":
      return "Nobody decided in time, so it never ran.";
  }
}

/** Everything Writ recorded about one call. */
export function CallDetail({ call }: { call: Call }) {
  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-paper px-4 py-3 font-serif text-[17px] leading-snug text-fg">
        {outcome(call)}
      </p>
      <dl className="divide-y divide-line">
        <Row label="Status">
          <StatusBadge status={call.status} />
        </Row>
        <Row label="Agent">
          <span className="font-mono">{call.agent}</span>
        </Row>
        <Row label="Tool">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{call.tool}</span>
            <EffectBadge effect={call.effect} />
          </span>
        </Row>
        <Row label="Rule said">
          <span className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={call.decision} />
            {call.reason}
          </span>
        </Row>
        {call.tainted ? (
          <Row label="Session">Had read third-party content before this call</Row>
        ) : null}
        {call.decidedBy ? (
          <Row label="Decided">
            {call.decidedBy}, {dateTime(call.decidedAt)}
            {call.decisionNote ? (
              <span className="mt-1 block text-fg-muted">“{call.decisionNote}”</span>
            ) : null}
          </Row>
        ) : null}
        <Row label="Requested">{dateTime(call.createdAt)}</Row>
        {call.durationMs !== null ? <Row label="Took">{call.durationMs} ms</Row> : null}
        {call.sessionId ? (
          <Row label="Session id">
            <span className="font-mono text-[12px] break-all text-fg-muted">{call.sessionId}</span>
          </Row>
        ) : null}
      </dl>
      <section>
        <h3 className="eyebrow mb-1.5">What the agent asked for</h3>
        <ArgumentList args={call.args} />
      </section>
      {call.approvedArgs ? (
        <section>
          <h3 className="eyebrow mb-1.5">What was approved (edited)</h3>
          <ArgumentList args={call.approvedArgs} />
        </section>
      ) : null}
      {call.output !== null ? (
        <section>
          <h3 className="eyebrow mb-1.5">{call.isError ? "Error" : "Result"}</h3>
          <Code>{call.output || "(empty)"}</Code>
        </section>
      ) : null}
    </div>
  );
}
