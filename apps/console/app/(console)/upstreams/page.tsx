"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Field, Switch } from "@/components/controls";
import { Empty, ErrorNote, PageHeader, Skeleton } from "@/components/page";
import { Sheet } from "@/components/sheet";
import { UpstreamDetail } from "@/components/upstream-detail";
import { api, errorText } from "@/lib/api";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export default function UpstreamsPage() {
  const upstreams = useApi(() => api.upstreams());
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("add")) setAdding(true);
  }, []);

  const list = upstreams.data?.upstreams;
  const open = list?.find((u) => u.id === openId) ?? null;
  return (
    <>
      <PageHeader
        title="Tools"
        description="The apps your agents can use through Writ, such as GitHub, Linear or your inbox. Their passwords and keys stay here, never on the agent's machine."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus />
            Connect tool
          </button>
        }
      />
      {upstreams.error ? <ErrorNote>{errorText(upstreams.error)}</ErrorNote> : null}
      {!list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty
          title="No tools connected yet"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              Connect your first tool
            </button>
          }
        >
          Connect anything your agents should use: GitHub, Linear, Sentry, your inbox, or a server
          you run yourself. Writ speaks MCP, the standard way agents talk to tools.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setOpenId(u.id)}
              className={cx(
                "card px-5 py-4 text-left transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-card",
                !u.enabled && "opacity-60",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper font-serif text-[20px] text-paper-ink">
                  {u.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-serif text-[18px] font-medium text-fg">
                      {u.name}
                    </span>
                    {u.trusted ? (
                      <span className="rounded bg-sunken px-1.5 text-[11px] text-fg-muted">
                        trusted
                      </span>
                    ) : null}
                    {!u.enabled ? (
                      <span className="rounded bg-sunken px-1.5 text-[11px] text-fg-muted">
                        off
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-fg-muted">{host(u.url)}</p>
                </div>
                <span
                  className={cx(
                    "flex shrink-0 items-center gap-1.5 text-[12px]",
                    u.status === "ok"
                      ? "text-ok"
                      : u.status === "error"
                        ? "text-danger"
                        : "text-fg-faint",
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {u.status === "ok"
                    ? "Connected"
                    : u.status === "error"
                      ? "Can't reach"
                      : "Not checked"}
                </span>
              </div>
              {u.status === "error" && u.lastError ? (
                <p className="mt-2 line-clamp-2 text-[12px] text-danger">{u.lastError}</p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Connect a tool" width={560}>
        <AddUpstream
          onAdded={(id) => {
            setAdding(false);
            void upstreams.reload().then(() => setOpenId(id));
          }}
        />
      </Sheet>
      <Sheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        description={open?.url}
        width={600}
      >
        {open ? (
          <UpstreamDetail
            upstream={open}
            onChanged={() => void upstreams.reload()}
            onRemoved={() => {
              setOpenId(null);
              void upstreams.reload();
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function AddUpstream({ onAdded }: { onAdded: (id: string) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = auth.trim();
      const res = await api.addUpstream({
        name: name.trim(),
        url: url.trim(),
        trusted,
        ...(token
          ? {
              headers: {
                Authorization: /^(bearer|basic)\s/i.test(token) ? token : `Bearer ${token}`,
              },
            }
          : {}),
      });
      if (res.error) setError(`Saved, but Writ couldn't list its tools yet: ${res.error}`);
      onAdded(res.upstream.id);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Name"
        htmlFor="up-name"
        hint="Prefixes its tools for agents: github → github__create_issue."
      >
        <input
          id="up-name"
          className="input font-mono"
          required
          placeholder="github"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
        />
      </Field>
      <Field label="MCP URL" htmlFor="up-url" hint="Streamable HTTP endpoint.">
        <input
          id="up-url"
          type="url"
          className="input"
          required
          placeholder="https://api.githubcopilot.com/mcp/"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <Field
        label="Access token"
        htmlFor="up-auth"
        hint="Optional. Sent as Authorization: Bearer …; stored encrypted and never shown again."
      >
        <input
          id="up-auth"
          type="password"
          className="input font-mono"
          autoComplete="off"
          placeholder="ghp_…"
          value={auth}
          onChange={(e) => setAuth(e.target.value)}
        />
      </Field>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3.5 py-3">
        <div>
          <p className="font-medium text-fg">Trusted output</p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            Leave off unless you control everything this server returns.
          </p>
        </div>
        <Switch label="Trusted output" checked={trusted} onChange={setTrusted} />
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Add and list tools
      </button>
    </form>
  );
}
