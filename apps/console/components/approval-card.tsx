"use client";

import { ArrowRight, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { api, type Call, errorText } from "@/lib/api";
import { ago, pretty } from "@/lib/format";
import { ArgumentList } from "./approval-args";
import { EffectBadge } from "./badges";
import { Mark } from "./brand";
import { ErrorNote } from "./page";

/**
 * One call waiting for a person, laid out like a request for a signature: the agent asks in its
 * own speech bubble, the ticket says exactly what would run, and the controls sit underneath.
 */
export function ApprovalCard({ call, onDecided }: { call: Call; onDecided: (c: Call) => void }) {
  const original = pretty(call.args);
  const [draft, setDraft] = useState(original);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edited = draft.trim() !== original.trim();
  const toolName = call.upstream ? call.tool.slice(call.upstream.length + 2) : call.tool;
  const shown = edited ? parseArgs(draft) : call.args;

  async function decide(approve: boolean) {
    setError(null);
    let args: Record<string, unknown> | undefined;
    if (approve && edited) {
      args = parseArgs(draft) ?? undefined;
      if (!args) {
        setError("The edited arguments aren't a valid JSON object.");
        return;
      }
    }
    setBusy(approve ? "approve" : "deny");
    try {
      const res = approve
        ? await api.approve(call.id, {
            ...(args ? { args } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          })
        : await api.deny(call.id, note.trim() || undefined);
      onDecided(res.call);
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  return (
    <article className="card enter overflow-hidden shadow-card">
      <header className="bg-paper px-5 pt-4 pb-6 sm:px-7">
        <p className="label flex items-center justify-end gap-2">
          <span className="pulse size-1.5 rounded-full bg-seal" />
          Needs your signature
        </p>
        <div className="mt-3 flex items-end gap-4">
          <Monogram name={call.agent} />
          <div className="relative min-w-0 flex-1 rounded-2xl bg-surface px-5 py-4 shadow-card">
            <span
              aria-hidden="true"
              className="absolute bottom-5 -left-1.5 size-3 rotate-45 bg-surface"
            />
            <p className="text-[12.5px] text-fg-muted">
              <span className="font-semibold text-paper-ink">{call.agent}</span> · asked{" "}
              <time dateTime={call.createdAt}>{ago(call.createdAt)}</time>
            </p>
            <h2 className="mt-1 font-serif text-[24px] leading-[1.2] font-medium text-fg sm:text-[27px]">
              {call.agent} wants to {humanize(toolName)}
              {call.upstream ? <span className="text-fg-muted"> on {call.upstream}</span> : null}
            </h2>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-6 sm:px-7">
        <p className="text-[14.5px] leading-relaxed text-fg-muted">
          Writ held this call until you decide. {call.reason} Nothing runs unless you approve it; if
          you deny it, the agent is told why.
        </p>

        {call.tainted ? (
          <div className="flex gap-3 rounded-xl border border-seal/25 bg-seal-soft px-4 py-3 text-[13.5px] leading-relaxed">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-seal" />
            <p className="text-fg">
              <span className="font-semibold text-seal">Read this one carefully. </span>
              Earlier in this session the agent read content written by someone else. Check that
              this is what you asked for, not what that content asked for.
            </p>
          </div>
        ) : null}

        <Ticket call={call} toolName={toolName} />

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">{edited ? "Arguments · edited by you" : "Arguments"}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Done" : "Edit"}
            </button>
          </div>
          {editing ? (
            <textarea
              className="input min-h-44 font-mono text-[12.5px]"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit arguments as JSON"
            />
          ) : shown ? (
            <ArgumentList args={shown} />
          ) : (
            <ErrorNote>The edited arguments aren't a valid JSON object.</ErrorNote>
          )}
        </section>

        <input
          className="input h-10"
          placeholder="Note for the agent (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button
            type="button"
            className="btn btn-approve h-10 rounded-[10px] px-5"
            disabled={busy !== null}
            onClick={() => void decide(true)}
          >
            {edited ? "Approve edited" : "Approve"}
            <ArrowRight />
          </button>
          <button
            type="button"
            className="btn btn-danger h-10 rounded-[10px] px-4"
            disabled={busy !== null}
            onClick={() => void decide(false)}
          >
            Deny
          </button>
          {call.expiresAt ? (
            <span className="ml-auto text-[12px] text-fg-faint">Expires {ago(call.expiresAt)}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** The request as a stub: what runs where, torn along a perforation from who is asking. */
function Ticket({ call, toolName }: { call: Call; toolName: string }) {
  const facts = [
    { label: "Agent", value: call.agent },
    { label: "Upstream", value: call.upstream ?? "none" },
    { label: "Effect", value: <EffectBadge effect={call.effect} /> },
  ];
  return (
    <div className="rounded-2xl bg-paper">
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between">
          <span className="label">Request</span>
          <span className="flex items-center gap-1.5 font-serif text-[15px] text-paper-ink">
            <Mark className="size-4" />
            writ
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface font-serif text-[22px] text-paper-ink">
            {(call.upstream ?? call.tool).charAt(0).toUpperCase()}
          </span>
          <code className="min-w-0 truncate font-mono text-[15px] font-medium text-fg">
            {toolName}
          </code>
        </div>
      </div>
      <div aria-hidden="true" className="relative">
        <div className="mx-5 border-t-[1.5px] border-dashed border-paper-line" />
        <span className="absolute top-1/2 -left-2.5 size-5 -translate-y-1/2 rounded-full bg-surface" />
        <span className="absolute top-1/2 -right-2.5 size-5 -translate-y-1/2 rounded-full bg-surface" />
      </div>
      <dl className="grid grid-cols-3 gap-4 px-5 pt-4 pb-5">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="label">{f.label}</dt>
            <dd className="mt-1 truncate font-medium text-fg">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The agent's initial in a seal-like circle, standing in for an avatar. */
function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="hidden size-14 shrink-0 place-items-center rounded-full border border-paper-line bg-surface font-serif text-[26px] text-paper-ink shadow-card sm:grid"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** `send_email` → "send email", `createEvent` → "create event". */
function humanize(tool: string): string {
  return tool
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function parseArgs(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
