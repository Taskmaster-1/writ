"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { ApprovalCard } from "@/components/approval-card";
import { ErrorNote, PageHeader, Skeleton } from "@/components/page";
import { api, errorText } from "@/lib/api";
import { cx } from "@/lib/format";
import { useCallEvents } from "@/lib/live";
import { useApi } from "@/lib/use-api";

export default function ApprovalsPage() {
  const pending = useApi(() => api.calls({ status: ["pending"], limit: 100 }));
  const setup = useApi(async () => {
    const [agents, upstreams, summary] = await Promise.all([
      api.agents(),
      api.upstreams(),
      api.summary(),
    ]);
    return {
      agents: agents.agents.filter((a) => !a.revokedAt),
      upstreams: upstreams.upstreams,
      summary,
    };
  });
  useCallEvents((change) => {
    void pending.reload();
    if (change.status !== "pending") void setup.reload();
  });

  const calls = pending.data?.calls;
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Calls your agents made that need a person. Approve, edit and approve, or deny with a note the agent will read."
      />
      {pending.error ? <ErrorNote>{errorText(pending.error)}</ErrorNote> : null}
      {!calls ? (
        <Skeleton className="h-56" />
      ) : calls.length > 0 ? (
        <div className="max-w-[720px] space-y-6">
          {[...calls].reverse().map((call) => (
            <ApprovalCard
              key={call.id}
              call={call}
              onDecided={(c) =>
                pending.setData((d) => (d ? { calls: d.calls.filter((x) => x.id !== c.id) } : d))
              }
            />
          ))}
        </div>
      ) : setup.data && (setup.data.agents.length === 0 || setup.data.upstreams.length === 0) ? (
        <GetStarted
          hasUpstream={setup.data.upstreams.length > 0}
          hasAgent={setup.data.agents.length > 0}
        />
      ) : (
        <AllClear last24h={setup.data?.summary.last24h ?? {}} />
      )}
    </>
  );
}

function AllClear({ last24h }: { last24h: Partial<Record<string, number>> }) {
  const ran = (last24h.succeeded ?? 0) + (last24h.failed ?? 0);
  const stats = [
    { label: "Calls run", value: ran },
    { label: "Approved by you", value: last24h.approved ?? 0 },
    { label: "Denied", value: last24h.denied ?? 0 },
    { label: "Blocked by rules", value: last24h.blocked ?? 0 },
  ];
  return (
    <div className="card px-6 py-10">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-5" />
        </span>
        <div>
          <p className="text-[15px] font-medium text-fg">Nothing needs you</p>
          <p className="text-fg-muted">New requests appear here the moment an agent makes them.</p>
        </div>
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3">
            <dt className="eyebrow">{s.label}</dt>
            <dd className="tabular mt-1 text-[22px] font-semibold text-fg">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-fg-faint">
        Last 24 hours ·{" "}
        <Link href="/activity" className="underline-offset-2 hover:underline">
          See all activity
        </Link>
      </p>
    </div>
  );
}

function GetStarted({ hasUpstream, hasAgent }: { hasUpstream: boolean; hasAgent: boolean }) {
  const steps = [
    {
      done: hasUpstream,
      title: "Add an upstream",
      body: "An MCP server whose tools your agents should use: GitHub, Linear, your own.",
      href: "/upstreams?add=1",
      cta: "Add upstream",
    },
    {
      done: hasAgent,
      title: "Create an agent",
      body: "Each agent gets its own token, so rules and the audit log know who did what.",
      href: "/agents?add=1",
      cta: "Create agent",
    },
    {
      done: false,
      title: "Connect it",
      body: "Point Claude Code, Cursor or any MCP client at Writ. Calls that need you show up here.",
      href: "/agents",
      cta: "See how",
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-6 py-5">
        <p className="text-[15px] font-medium text-fg">
          Put Writ between your agents and their tools
        </p>
        <p className="mt-1 text-fg-muted">Three steps, about two minutes.</p>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li
            key={s.title}
            className="flex items-start gap-4 border-b border-line px-6 py-4 last:border-b-0"
          >
            <span
              className={cx(
                "tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-mono text-[12px]",
                s.done
                  ? "bg-ok-soft text-ok"
                  : i === next
                    ? "bg-fg text-bg"
                    : "bg-sunken text-fg-muted",
              )}
            >
              {s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cx("font-medium", s.done ? "text-fg-muted line-through" : "text-fg")}>
                {s.title}
              </p>
              <p className="mt-0.5 text-fg-muted">{s.body}</p>
            </div>
            {!s.done ? (
              <Link href={s.href} className={cx("btn btn-sm", i === next && "btn-primary")}>
                {s.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
