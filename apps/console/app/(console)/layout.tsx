"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { Shell } from "@/components/shell";
import { api } from "@/lib/api";

type User = { id: string; name: string; email: string };

/** Everything behind sign-in. Sends signed-out visitors to /sign-in. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => router.replace("/sign-in"));
  }, [router]);

  if (!user)
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="animate-pulse">
          <Wordmark />
        </span>
      </div>
    );
  return <Shell user={user}>{children}</Shell>;
}
