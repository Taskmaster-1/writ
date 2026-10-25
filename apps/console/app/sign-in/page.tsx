"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Mark } from "@/components/brand";
import { Field } from "@/components/controls";
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
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <Mark className="size-9 text-fg" />
        <h1 className="mt-6 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
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
    </main>
  );
}
