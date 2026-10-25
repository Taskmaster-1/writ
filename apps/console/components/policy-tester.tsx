"use client";

import { type FormEvent, useState } from "react";
import { api, type Effect, errorText, type Verdict } from "@/lib/api";
import { DecisionBadge } from "./badges";
import { ErrorNote } from "./page";

/** "What would happen if…": runs a made-up call through the saved policy. */
export function PolicyTester() {
  const [tool, setTool] = useState("github__create_issue");
  const [agent, setAgent] = useState("claude-code");
  const [effect, setEffect] = useState<Effect>("write");
  const [args, setArgs] = useState('{ "repo": "acme/web" }');
  const [tainted, setTainted] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = args.trim() ? (JSON.parse(args) as Record<string, unknown>) : {};
    } catch {
      setError("Arguments must be a JSON object.");
      return;
    }
    try {
      setVerdict((await api.testPolicy({ tool, agent, effect, args: parsed, tainted })).verdict);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form onSubmit={run} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          aria-label="Tool"
          className="input font-mono text-[13px]"
          value={tool}
          onChange={(e) => setTool(e.target.value)}
        />
        <input
          aria-label="Agent"
          className="input font-mono text-[13px]"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        />
        <select
          aria-label="Effect"
          className="input w-auto"
          value={effect}
          onChange={(e) => setEffect(e.target.value as Effect)}
        >
          {(["read", "write", "send", "destructive"] as const).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <textarea
        aria-label="Arguments (JSON)"
        className="input min-h-20 font-mono text-[12.5px]"
        spellCheck={false}
        value={args}
        onChange={(e) => setArgs(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-fg-muted">
          <input type="checkbox" checked={tainted} onChange={(e) => setTainted(e.target.checked)} />
          Session has read third-party content
        </label>
        <button type="submit" className="btn btn-sm ml-auto">
          Test
        </button>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {verdict ? (
        <p
          className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2.5 text-[13px] text-fg"
          aria-live="polite"
        >
          <DecisionBadge decision={verdict.decision} />
          {verdict.reason}
        </p>
      ) : null}
    </form>
  );
}
