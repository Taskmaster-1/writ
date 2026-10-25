"use client";

import { KeyRound, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ConnectSnippets } from "@/components/connect-snippets";
import { Field } from "@/components/controls";
import { Empty, ErrorNote, PageHeader, Skeleton } from "@/components/page";
import { Sheet } from "@/components/sheet";
import { type Agent, api, errorText } from "@/lib/api";
import { ago, cx } from "@/lib/format";
import { useApi } from "@/lib/use-api";

/** A token just issued: shown once, with setup instructions. */
type Issued = { agent: Agent; token: string };

export default function AgentsPage() {
  const agents = useApi(() => api.agents());
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("add")) setAdding(true);
  }, []);

  const list = agents.data?.agents;
  return (
    <>
      <PageHeader
        title="Agents"
        description="Everything that calls tools through Writ. Each agent has its own token, so rules can treat them differently and the log shows who did what."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus />
            New agent
          </button>
        }
      />
      {agents.error ? <ErrorNote>{errorText(agents.error)}</ErrorNote> : null}
      {!list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty
          title="No agents yet"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              Create your first agent
            </button>
          }
        >
          Name it after what will use it, like claude-code, cursor or release-bot.
        </Empty>
      ) : (
        <div className="card divide-y divide-line">
          {list.map((a) => (
            <AgentRow
              key={a.id}
              agent={a}
              onIssued={setIssued}
              onChanged={() => void agents.reload()}
            />
          ))}
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New agent">
        <NewAgent
          onCreated={(i) => {
            setAdding(false);
            setIssued(i);
            void agents.reload();
          }}
        />
      </Sheet>
      <Sheet
        open={issued !== null}
        onClose={() => setIssued(null)}
        title={issued ? `Connect ${issued.agent.name}` : ""}
        description="Copy the token now. Writ stores only a hash of it, so it can't be shown again."
        width={600}
      >
        {issued ? (
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-1.5">Token</p>
              <code className="block rounded-lg border border-seal/40 bg-seal-soft px-3 py-2.5 font-mono text-[12.5px] break-all text-fg">
                {issued.token}
              </code>
            </div>
            <ConnectSnippets token={issued.token} agent={issued.agent.name} />
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function AgentRow({
  agent: a,
  onIssued,
  onChanged,
}: {
  agent: Agent;
  onIssued: (i: Issued) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const revoked = Boolean(a.revokedAt);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      window.alert(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4",
        revoked && "opacity-55",
      )}
    >
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <p className="font-mono text-[14px] font-medium text-fg">{a.name}</p>
        <p className="truncate text-[13px] text-fg-muted">
          {a.description || "No description"} · <span className="font-mono">{a.tokenHint}…</span>
        </p>
      </div>
      <span className="mr-auto text-[13px] text-fg-muted sm:mr-0">
        {revoked
          ? `Revoked ${ago(a.revokedAt)}`
          : a.lastSeenAt
            ? `Active ${ago(a.lastSeenAt)}`
            : "Never connected"}
      </span>
      {!revoked ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (
                  !window.confirm(
                    `Issue a new token for ${a.name}? The current one stops working now.`,
                  )
                )
                  return;
                onIssued(await api.rotateAgent(a.id));
              })
            }
          >
            <KeyRound />
            New token
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (
                  !window.confirm(
                    `Revoke ${a.name}? Its sessions end now and its token stops working.`,
                  )
                )
                  return;
                await api.revokeAgent(a.id);
                onChanged();
              })
            }
          >
            Revoke
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NewAgent({ onCreated }: { onCreated: (i: Issued) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await api.createAgent({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      );
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Name"
        htmlFor="agent-name"
        hint="Lowercase letters, digits and dashes. Rules match on it, e.g. support-*."
      >
        <input
          id="agent-name"
          className="input font-mono"
          required
          placeholder="claude-code"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
        />
      </Field>
      <Field label="Description" htmlFor="agent-desc">
        <input
          id="agent-desc"
          className="input"
          placeholder="Ada's laptop"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Create and show token
      </button>
    </form>
  );
}
