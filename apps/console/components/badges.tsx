import type { CallStatus, Decision, Effect } from "@/lib/api";
import { cx } from "@/lib/format";

const EFFECT_LABEL: Record<Effect, string> = {
  read: "Read",
  write: "Write",
  send: "Send",
  destructive: "Destructive",
};

/** What a tool can do. Colour by risk; the label always says it in words too. */
export function EffectBadge({ effect }: { effect: Effect }) {
  return (
    <span
      className="inline-flex h-5 items-center gap-1.5 rounded-[5px] px-1.5 font-mono text-[11px] font-medium"
      style={{
        color: `var(--${effect})`,
        background: `color-mix(in oklab, var(--${effect}) 11%, transparent)`,
      }}
    >
      {EFFECT_LABEL[effect]}
    </span>
  );
}

const STATUS: Record<CallStatus, { label: string; tone: "seal" | "ok" | "danger" | "muted" }> = {
  pending: { label: "Needs you", tone: "seal" },
  approved: { label: "Approved", tone: "ok" },
  running: { label: "Running", tone: "muted" },
  succeeded: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  denied: { label: "Denied", tone: "danger" },
  blocked: { label: "Blocked", tone: "danger" },
  expired: { label: "Expired", tone: "muted" },
};

const TONE = {
  seal: "text-seal bg-seal-soft",
  ok: "text-ok bg-ok-soft",
  danger: "text-danger bg-danger-soft",
  muted: "text-fg-muted bg-sunken",
};

export function StatusBadge({ status }: { status: CallStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium",
        TONE[s.tone],
      )}
    >
      <span className={cx("size-1.5 rounded-full bg-current", status === "pending" && "pulse")} />
      {s.label}
    </span>
  );
}

const DECISION_LABEL: Record<Decision, string> = { allow: "Allow", ask: "Ask", block: "Block" };
const DECISION_TONE: Record<Decision, string> = {
  allow: TONE.ok,
  ask: TONE.seal,
  block: TONE.danger,
};

export function DecisionBadge({ decision }: { decision: Decision }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center rounded-[5px] px-1.5 font-mono text-[11px] font-medium",
        DECISION_TONE[decision],
      )}
    >
      {DECISION_LABEL[decision]}
    </span>
  );
}

/** A name's initial in a seal-like circle, standing in for an avatar. Size it with className. */
export function Monogram({
  name,
  className = "grid size-8 text-[15px]",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "shrink-0 place-items-center rounded-full border border-paper-line bg-surface font-serif text-paper-ink",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
