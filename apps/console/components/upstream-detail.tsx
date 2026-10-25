"use client";

import { RefreshCw, Trash } from "lucide-react";
import { useState } from "react";
import { api, type Effect, errorText, type Upstream } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { EffectBadge } from "./badges";
import { Switch } from "./controls";
import { ErrorNote, Skeleton } from "./page";

const EFFECTS: Effect[] = ["read", "write", "send", "destructive"];

/** One upstream: its tools and what each is allowed to be, plus trust and on/off. */
export function UpstreamDetail({
  upstream,
  onChanged,
  onRemoved,
}: {
  upstream: Upstream;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const detail = useApi(() => api.upstream(upstream.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = detail.data?.upstream ?? upstream;

  async function update(body: Parameters<typeof api.updateUpstream>[1]) {
    setBusy(true);
    setError(null);
    try {
      await api.updateUpstream(upstream.id, body);
      detail.setData(await api.upstream(upstream.id));
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Toggle
          label="Enabled"
          hint="Off hides its tools from every agent."
          checked={current.enabled}
          disabled={busy}
          onChange={(enabled) => void update({ enabled })}
        />
        <Toggle
          label="Trusted output"
          hint="Turn on only for servers whose content you control. Output from untrusted servers can carry prompt injection, so reading it makes the session need approval for any change."
          checked={current.trusted}
          disabled={busy}
          onChange={(trusted) => void update({ trusted })}
        />
      </section>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="eyebrow">Tools and their effects</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={detail.loading}
            onClick={() =>
              void api
                .upstream(upstream.id, true)
                .then(detail.setData)
                .catch(() => {})
            }
          >
            <RefreshCw />
            Refresh
          </button>
        </div>
        <p className="mb-3 text-[13px] text-fg-muted">
          Effects come from the server's own annotations. Correct any that are wrong: rules and
          defaults act on these.
        </p>
        {!detail.data ? (
          <Skeleton className="h-40" />
        ) : detail.data.error ? (
          <ErrorNote>Couldn't list tools: {detail.data.error}</ErrorNote>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {detail.data.tools.map((t) => (
              <li key={t.name} className="flex items-start gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13px] font-medium text-fg">{t.name}</p>
                  {t.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-fg-muted">{t.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!t.overridden ? <EffectBadge effect={t.effect} /> : null}
                  <select
                    aria-label={`Effect of ${t.name}`}
                    className="input h-7 w-auto py-0 pr-7 text-[12px]"
                    value={t.overridden ? t.effect : ""}
                    disabled={busy}
                    onChange={(e) => {
                      const next = { ...current.toolEffects };
                      if (e.target.value) next[t.name] = e.target.value as Effect;
                      else delete next[t.name];
                      void update({ toolEffects: next });
                    }}
                  >
                    <option value="">As declared</option>
                    {EFFECTS.map((effect) => (
                      <option key={effect} value={effect}>
                        {effect[0]!.toUpperCase() + effect.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="btn btn-danger"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              `Remove ${upstream.name}? Agents lose its tools now. Past activity stays.`,
            )
          )
            return;
          setBusy(true);
          try {
            await api.removeUpstream(upstream.id);
            onRemoved();
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <Trash />
        Remove upstream
      </button>
    </div>
  );
}

function Toggle(props: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3.5 py-3">
      <div>
        <p className="font-medium text-fg">{props.label}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted">{props.hint}</p>
      </div>
      <Switch
        label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}
