import type { ReactNode } from "react";
import type { Call } from "@/lib/api";
import { dateTime, pretty } from "@/lib/format";
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

/** Everything Writ recorded about one call. */
export function CallDetail({ call }: { call: Call }) {
  return (
    <div className="space-y-6">
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
        <Row label="Policy">
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
        {call.durationMs !== null ? <Row label="Upstream time">{call.durationMs} ms</Row> : null}
        {call.sessionId ? (
          <Row label="Session id">
            <span className="font-mono text-[12px] break-all text-fg-muted">{call.sessionId}</span>
          </Row>
        ) : null}
      </dl>
      <section>
        <h3 className="eyebrow mb-1.5">Arguments from the agent</h3>
        <Code>{pretty(call.args)}</Code>
      </section>
      {call.approvedArgs ? (
        <section>
          <h3 className="eyebrow mb-1.5">Arguments as approved (edited)</h3>
          <Code>{pretty(call.approvedArgs)}</Code>
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
