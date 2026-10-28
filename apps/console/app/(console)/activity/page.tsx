"use client";

import { useEffect, useState } from "react";
import { EffectBadge, Monogram, StatusBadge } from "@/components/badges";
import { CallDetail } from "@/components/call-detail";
import { Segmented } from "@/components/controls";
import { Empty, ErrorNote, PageHeader, Skeleton } from "@/components/page";
import { Sheet } from "@/components/sheet";
import { api, type Call, type CallStatus, errorText } from "@/lib/api";
import { ago, dateTime, humanize, toolName } from "@/lib/format";
import { useCallEvents } from "@/lib/live";
import { useApi } from "@/lib/use-api";

const FILTERS: Record<string, { label: string; status?: CallStatus[] }> = {
  all: { label: "All" },
  ran: { label: "Ran", status: ["succeeded", "failed", "running"] },
  stopped: { label: "Stopped", status: ["denied", "blocked", "expired"] },
  pending: { label: "Needs you", status: ["pending"] },
};
type Filter = keyof typeof FILTERS;
const PAGE = 50;

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [more, setMore] = useState<Call[]>([]);
  const [end, setEnd] = useState(false);
  const [open, setOpen] = useState<Call | null>(null);
  const status = FILTERS[filter]?.status;
  const calls = useApi(() => api.calls({ ...(status ? { status } : {}), limit: PAGE }));
  useCallEvents(() => void calls.reload());
  const { reload } = calls;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the filter changes
  useEffect(() => {
    void reload();
  }, [filter, reload]);

  const list = calls.data ? [...calls.data.calls, ...more] : null;

  const change = (f: Filter) => {
    setFilter(f);
    setMore([]);
    setEnd(false);
  };

  async function loadMore() {
    const last = list?.at(-1);
    if (!last) return;
    const next = await api.calls({
      ...(status ? { status } : {}),
      before: last.createdAt,
      limit: PAGE,
    });
    setMore((m) => [...m, ...next.calls]);
    if (next.calls.length < PAGE) setEnd(true);
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything your agents did through Writ: what they tried, whether it was allowed, who decided, and what happened."
        actions={
          <Segmented
            label="Filter"
            value={filter}
            onChange={change}
            options={Object.entries(FILTERS).map(([value, f]) => ({ value, label: f.label }))}
          />
        }
      />
      {calls.error ? <ErrorNote>{errorText(calls.error)}</ErrorNote> : null}
      {!list ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <Empty title="Nothing here yet">
          As soon as a connected agent uses a tool, it shows up here.
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken/60 sm:px-5"
                >
                  <Monogram name={c.agent} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">
                      <span className="font-medium">{c.agent}</span>{" "}
                      <span className="text-fg-muted">·</span> {humanize(toolName(c))}
                      {c.upstream ? <span className="text-fg-muted"> on {c.upstream}</span> : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <EffectBadge effect={c.effect} />
                      <span className="truncate font-mono text-[11.5px] text-fg-faint">
                        {c.tool}
                      </span>
                    </span>
                  </span>
                  <StatusBadge status={c.status} />
                  <time
                    className="hidden w-20 text-right text-[12px] text-fg-faint sm:block"
                    title={dateTime(c.createdAt)}
                  >
                    {ago(c.createdAt)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
          {!end && list.length >= PAGE ? (
            <div className="border-t border-line p-3 text-center">
              <button type="button" className="btn btn-sm" onClick={() => void loadMore()}>
                Load older
              </button>
            </div>
          ) : null}
        </div>
      )}
      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.agent} · ${humanize(toolName(open))}` : ""}
        description={open ? `${open.tool} · ${dateTime(open.createdAt)}` : undefined}
        width={620}
      >
        {open ? <CallDetail call={list?.find((c) => c.id === open.id) ?? open} /> : null}
      </Sheet>
    </>
  );
}
