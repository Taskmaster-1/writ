"use client";

import { useEffect, useRef } from "react";
import type { CallStatus } from "./api";

type Change = { id: string; status: CallStatus };
type Listener = (change: Change) => void;

/**
 * One event stream per tab, shared by every component that listens. Browsers allow only six
 * connections per site over HTTP/1.1, so each hook opening its own stream (and pages that
 * linger in the back/forward cache keeping theirs) would soon block ordinary requests. The
 * stream closes when the page is hidden and reopens when it is shown again.
 */
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function open() {
  if (source || typeof window === "undefined") return;
  source = new EventSource("/api/calls/events/stream");
  source.addEventListener("call", (e) => {
    let change: Change;
    try {
      change = JSON.parse((e as MessageEvent<string>).data) as Change;
    } catch {
      return;
    }
    for (const fn of listeners) fn(change);
  });
}

function close() {
  source?.close();
  source = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", close);
  window.addEventListener("pageshow", () => {
    if (listeners.size > 0) open();
  });
}

/** Calls `onChange` whenever any call changes status. */
export function useCallEvents(onChange: Listener) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    const fn: Listener = (c) => handler.current(c);
    listeners.add(fn);
    open();
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) close();
    };
  }, []);
}
