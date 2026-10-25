"use client";

import { useEffect, useState } from "react";
import { EffectBadge, StatusBadge } from "@/components/badges";
import { CallDetail } from "@/components/call-detail";
import { Segmented } from "@/components/controls";
import { Empty, ErrorNote, PageHeader, Skeleton } from "@/components/page";
import { Sheet } from "@/components/sheet";
import { api, type Call, type CallStatus, errorText } from "@/lib/api";
import { ago, dateTime } from "@/lib/format";
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
        description="Every tool call any agent made through Writ, what the policy said, who decided, and what came back."
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
          Calls show up the moment a connected agent makes one.
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-sunken/60 sm:grid-cols-[120px_1fr_auto_auto]"
                >
                  <span className="truncate font-mono text-[13px] text-fg-muted sm:order-none">
                    {c.agent}
                  </span>
                  <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                    <span className="truncate font-mono text-[13px] font-medium text-fg">
                      {c.tool}
                    </span>
                    <EffectBadge effect={c.effect} />
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
        title={open?.tool ?? ""}
        description={open ? `${open.agent} · ${dateTime(open.createdAt)}` : undefined}
        width={620}
      >
        {open ? <CallDetail call={list?.find((c) => c.id === open.id) ?? open} /> : null}
      </Sheet>
    </>
  );
}
