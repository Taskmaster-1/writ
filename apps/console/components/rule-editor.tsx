"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "lucide-react";
import type { Decision, Matcher, MatcherOp, Rule } from "@/lib/api";

const OPS: { value: MatcherOp; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "allEndWith", label: "all end with" },
  { value: "matches", label: "matches regex" },
  { value: "exists", label: "is set" },
];

const DECISIONS: { value: Decision; label: string }[] = [
  { value: "allow", label: "Allow" },
  { value: "ask", label: "Ask" },
  { value: "block", label: "Block" },
];

/** Condition values are typed as JSON when they parse (lists, numbers), else as text. */
export const showValue = (v: unknown) =>
  v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
export function readValue(text: string): unknown {
  const t = text.trim();
  if (!t) return "";
  try {
    return JSON.parse(t);
  } catch {
    return text;
  }
}

/** One rule, edited in place. */
export function RuleEditor({
  rule,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  rule: Rule;
  index: number;
  count: number;
  onChange: (r: Rule) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const when = rule.when ?? [];
  const setWhen = (next: Matcher[]) => onChange({ ...rule, when: next });
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular w-5 font-mono text-[12px] text-fg-faint">{index + 1}</span>
        <select
          aria-label="Decision"
          className="input h-8 w-auto"
          value={rule.decision}
          onChange={(e) => onChange({ ...rule, decision: e.target.value as Decision })}
        >
          {DECISIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Tool pattern"
          className="input h-8 min-w-40 flex-1 font-mono text-[13px]"
          placeholder="github__*"
          value={rule.tool}
          onChange={(e) => onChange({ ...rule, tool: e.target.value })}
        />
        <span className="text-fg-muted">for</span>
        <input
          aria-label="Agent pattern"
          className="input h-8 w-36 font-mono text-[13px]"
          placeholder="any agent"
          value={rule.agent ?? ""}
          onChange={(e) => onChange({ ...rule, agent: e.target.value || null })}
        />
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-danger"
            aria-label="Delete rule"
            onClick={onRemove}
          >
            <Trash />
          </button>
        </span>
      </div>

      {when.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no identity beyond position
        <div key={i} className="flex flex-wrap items-center gap-2 pl-7">
          <span className="w-9 text-[12px] text-fg-muted">{i === 0 ? "when" : "and"}</span>
          <input
            aria-label="Argument path"
            className="input h-8 w-32 font-mono text-[13px]"
            placeholder="to"
            value={m.path}
            onChange={(e) =>
              setWhen(when.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))
            }
          />
          <select
            aria-label="Condition"
            className="input h-8 w-auto"
            value={m.op}
            onChange={(e) =>
              setWhen(when.map((x, j) => (j === i ? { ...x, op: e.target.value as MatcherOp } : x)))
            }
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {m.op !== "exists" ? (
            <input
              aria-label="Value"
              className="input h-8 min-w-32 flex-1 font-mono text-[13px]"
              placeholder={m.op === "in" || m.op === "allEndWith" ? '["@acme.com"]' : "value"}
              value={showValue(m.value)}
              onChange={(e) =>
                setWhen(
                  when.map((x, j) => (j === i ? { ...x, value: readValue(e.target.value) } : x)),
                )
              }
            />
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Remove condition"
            onClick={() => setWhen(when.filter((_, j) => j !== i))}
          >
            <Trash />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pl-7">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setWhen([...when, { path: "", op: "equals", value: "" }])}
        >
          <Plus />
          Condition
        </button>
        <input
          aria-label="Note"
          className="input h-8 flex-1 text-[13px]"
          placeholder="Note shown in the log, e.g. Internal email is fine"
          value={rule.note ?? ""}
          onChange={(e) => onChange({ ...rule, note: e.target.value || null })}
        />
      </div>
    </div>
  );
}
