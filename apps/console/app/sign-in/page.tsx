"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { Field } from "@/components/controls";
import { HowItWorks, WritInBrief } from "@/components/how-it-works";
import { ErrorNote } from "@/components/page";
import { api, errorText } from "@/lib/api";

/** Sign in, or, on a fresh install, create the owner account. */
export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "owner" | "sign-in">("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .setup()
      .then((s) => setMode(s.needsOwner ? "owner" : "sign-in"))
      .catch(() => setMode("sign-in"));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "owner") await api.signUp(name.trim(), email.trim(), password);
      else await api.signIn(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const owner = mode === "owner";
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <div className="mx-auto my-auto w-full max-w-[380px] py-12">
          <h1 className="font-serif text-[32px] leading-tight font-medium tracking-[-0.01em]">
            {owner ? "Set up Writ" : "Sign in to Writ"}
          </h1>
          <p className="mt-2 text-fg-muted">
            {owner
              ? "This is a new install. Create the owner account; you'll approve what your agents do from here."
              : "Approve what your agents do, and see everything they did."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4" aria-busy={mode === "loading"}>
            {owner ? (
              <Field label="Name" htmlFor="name">
                <input
                  id="name"
                  className="input"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            ) : null}
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                className="input"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={owner ? "At least 10 characters." : undefined}
            >
              <input
                id="password"
                type="password"
                className="input"
                required
                minLength={owner ? 10 : undefined}
                autoComplete={owner ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <button
              type="submit"
              className="btn btn-primary h-9 w-full"
              disabled={busy || mode === "loading"}
            >
              {owner ? "Create owner account" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
      <aside className="border-t border-paper-line bg-paper px-6 py-10 sm:px-12 lg:flex lg:flex-col lg:justify-center lg:border-t-0 lg:border-l">
        <div className="mx-auto max-w-[620px]">
          <WritInBrief />
          <HowItWorks className="mt-8" />
        </div>
      </aside>
    </main>
  );
}
