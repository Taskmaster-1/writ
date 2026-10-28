"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { EffectBadge } from "@/components/badges";
import { Segmented, Switch } from "@/components/controls";
import { ErrorNote, PageHeader, Skeleton } from "@/components/page";
import { PolicyTester } from "@/components/policy-tester";
import { RuleEditor } from "@/components/rule-editor";
import { api, type Decision, type Effect, errorText, type Rule } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const EFFECTS: { effect: Effect; hint: string }[] = [
  { effect: "read", hint: "Looks things up; changes nothing." },
  { effect: "write", hint: "Creates or changes something you own." },
  { effect: "send", hint: "Reaches other people: email, messages, invites." },
  { effect: "destructive", hint: "Deletes or can't be undone." },
];

const strip = (rules: (Rule & { id?: string })[]): Rule[] =>
  rules.map(({ tool, agent, decision, when, note }) => ({
    tool,
    agent: agent ?? null,
    decision,
    when: when ?? null,
    note: note ?? null,
  }));

export default function RulesPage() {
  const policy = useApi(() => api.policy());
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (policy.data && draft === null) setDraft(strip(policy.data.rules));
  }, [policy.data, draft]);

  const saved = policy.data ? JSON.stringify(strip(policy.data.rules)) : "";
  const dirty = draft !== null && JSON.stringify(draft) !== saved;

  async function saveSettings(body: {
    defaults?: Partial<Record<Effect, Decision>>;
    strictTaint?: boolean;
  }) {
    setError(null);
    try {
      policy.setData(await api.saveSettings(body));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveRules() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.saveRules(draft);
      policy.setData(next);
      setDraft(strip(next.rules));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const data = policy.data;
  return (
    <>
      <PageHeader
        title="Rules"
        description="Decide what agents may do on their own, what needs your yes, and what never happens. Out of the box: reading runs, everything else asks you."
      />
      {policy.error ? <ErrorNote>{errorText(policy.error)}</ErrorNote> : null}
      {error ? (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
      {!data || !draft ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="space-y-8">
          <section className="card divide-y divide-line">
            <h2 className="px-5 pt-4 pb-3 font-serif text-[19px] font-medium text-fg">
              What happens by default
            </h2>
            {EFFECTS.map(({ effect, hint }) => (
              <div key={effect} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <EffectBadge effect={effect} />
                  <p className="mt-1 text-[13px] text-fg-muted">{hint}</p>
                </div>
                <Segmented
                  label={`Default for ${effect}`}
                  value={data.defaults[effect]}
                  onChange={(d) => void saveSettings({ defaults: { [effect]: d } })}
                  options={[
                    { value: "allow", label: "Allow" },
                    { value: "ask", label: "Ask" },
                    { value: "block", label: "Block" },
                  ]}
                />
              </div>
            ))}
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <p className="font-medium text-fg">Strict mode</p>
                <p className="mt-0.5 max-w-[560px] text-[13px] text-fg-muted">
                  Treat every session as if it had already read untrusted content, so only reads run
                  without a person. Use it when agents also read things Writ can't see, like the web
                  or local files.
                </p>
              </div>
              <Switch
                label="Strict mode"
                checked={data.strictTaint}
                onChange={(v) => void saveSettings({ strictTaint: v })}
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-[19px] font-medium text-fg">Your rules</h2>
                <p className="text-[13px] text-fg-muted">
                  Exceptions to the defaults, checked top to bottom. A Block always wins.
                </p>
              </div>
              <div className="flex gap-2">
                {dirty ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setDraft(strip(data.rules))}
                  >
                    Discard
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDraft([...draft, { tool: "", decision: "ask" }])}
                >
                  <Plus />
                  Add rule
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!dirty || saving}
                  onClick={() => void saveRules()}
                >
                  Save rules
                </button>
              </div>
            </div>
            {draft.length === 0 ? (
              <p className="card px-5 py-8 text-center text-fg-muted">
                No rules: every call gets its effect's default. Add one to trust an agent with a
                tool, or to block something outright.
              </p>
            ) : (
              <div className="card divide-y divide-line">
                {draft.map((rule, i) => (
                  <RuleEditor
                    // biome-ignore lint/suspicious/noArrayIndexKey: rules are ordered and edited by position
                    key={i}
                    rule={rule}
                    index={i}
                    count={draft.length}
                    onChange={(r) => setDraft(draft.map((x, j) => (j === i ? r : x)))}
                    onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
                    onMove={(delta) => {
                      const next = [...draft];
                      const [moved] = next.splice(i, 1);
                      next.splice(i + delta, 0, moved!);
                      setDraft(next);
                    }}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 text-[12px] text-fg-faint">
              Patterns use * as a wildcard: github__*, *__delete_*, release-*. Argument paths use
              dots: issue.labels.
            </p>
          </section>

          <section className="card px-5 py-4">
            <h2 className="font-serif text-[19px] font-medium text-fg">Try it out</h2>
            <p className="mt-0.5 mb-4 text-[13px] text-fg-muted">
              Describe something an agent might do, and see what Writ would do with it. Nothing
              actually runs.
            </p>
            <PolicyTester />
          </section>
        </div>
      )}
    </>
  );
}
