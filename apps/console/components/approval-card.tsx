"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { api, type Call, errorText } from "@/lib/api";
import { ago, pretty } from "@/lib/format";
import { EffectBadge } from "./badges";
import { ErrorNote } from "./page";

/** One call waiting for a person: what the agent wants to do, why it's asking, and the controls. */
export function ApprovalCard({ call, onDecided }: { call: Call; onDecided: (c: Call) => void }) {
  const original = pretty(call.args);
  const [draft, setDraft] = useState(original);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edited = draft.trim() !== original.trim();
  const toolName = call.upstream ? call.tool.slice(call.upstream.length + 2) : call.tool;

  async function decide(approve: boolean) {
    setError(null);
    let args: Record<string, unknown> | undefined;
    if (approve && edited) {
      try {
        const parsed = JSON.parse(draft) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        args = parsed as Record<string, unknown>;
      } catch {
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
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-5 py-3.5">
        <span className="font-medium text-fg">{call.agent}</span>
        <span className="text-fg-muted">wants to run</span>
        <code className="font-mono text-[13px] font-medium text-fg">{toolName}</code>
        {call.upstream ? <span className="text-fg-muted">on {call.upstream}</span> : null}
        <EffectBadge effect={call.effect} />
        <time className="ml-auto text-[12px] text-fg-faint" dateTime={call.createdAt}>
          {ago(call.createdAt)}
        </time>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div className="space-y-1.5 text-[13px]">
          <p className="text-fg-muted">{call.reason}</p>
          {call.tainted ? (
            <p className="flex items-start gap-2 text-seal">
              <ShieldAlert className="mt-px size-4 shrink-0" />
              Earlier in this session the agent read content written by someone else. Check that
              this is what you asked for, not what that content asked for.
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow">{edited ? "Arguments (edited)" : "Arguments"}</span>
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
              className="input min-h-40 font-mono text-[12.5px]"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit arguments as JSON"
            />
          ) : (
            <pre className="max-h-72 overflow-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-fg">
              {draft}
            </pre>
          )}
        </div>

        <input
          className="input"
          placeholder="Note (optional). On a denial, the agent sees it."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy !== null}
          onClick={() => void decide(false)}
        >
          Deny
        </button>
        <button
          type="button"
          className="btn btn-approve"
          disabled={busy !== null}
          onClick={() => void decide(true)}
        >
          {edited ? "Approve edited" : "Approve"}
        </button>
      </footer>
    </article>
  );
}
