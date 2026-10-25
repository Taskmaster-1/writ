"use client";

import { Activity, Bot, FileCheck2, LogOut, Plug, Scale } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useCallEvents } from "@/lib/live";
import { useApi } from "@/lib/use-api";
import { Wordmark } from "./brand";

const NAV = [
  { href: "/", label: "Approvals", icon: FileCheck2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/upstreams", label: "Upstreams", icon: Plug },
  { href: "/rules", label: "Rules", icon: Scale },
];

export function Shell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const summary = useApi(() => api.summary());
  const [leaving, setLeaving] = useState(false);
  useCallEvents(() => void summary.reload());
  const pending = summary.data?.pending ?? 0;

  const signOut = async () => {
    setLeaving(true);
    await api.signOut().catch(() => {});
    router.replace("/sign-in");
  };

  const links = NAV.map((item) => {
    const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors",
          active ? "bg-sunken text-fg" : "text-fg-muted hover:bg-sunken hover:text-fg",
        )}
      >
        <Icon className="size-4" />
        {item.label}
        {item.href === "/" && pending > 0 ? (
          <span className="tabular ml-auto rounded-full bg-seal px-1.5 text-[11px] leading-[18px] font-semibold text-white">
            {pending}
          </span>
        ) : null}
      </Link>
    );
  });

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 z-10 flex flex-col border-b border-line bg-bg md:h-dvh md:border-r md:border-b-0">
        <div className="flex h-14 items-center px-4">
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0" aria-label="Main">
          {links}
        </nav>
        <div className="mt-auto hidden border-t border-line p-3 md:block">
          <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
          <p className="truncate text-[12px] text-fg-muted">{user.email}</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2 -ml-2"
            onClick={signOut}
            disabled={leaving}
          >
            <LogOut />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 md:py-10">
        <div className="mx-auto max-w-[1040px]">{children}</div>
      </main>
    </div>
  );
}
