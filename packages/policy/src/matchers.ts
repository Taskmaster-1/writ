import type { Matcher } from "./types";

/** Reads `a.b.c` from a value. Missing segments give undefined. */
export function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const asText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? null));

/**
 * Whether one matcher holds for a call's arguments. String tests on an array argument hold
 * only when they hold for every element: `to` allEndWith `@acme.com` fails if any recipient
 * is outside acme.com.
 */
export function matches(args: unknown, m: Matcher): boolean {
  const actual = readPath(args, m.path);
  switch (m.op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "equals":
      return JSON.stringify(actual) === JSON.stringify(m.value);
    case "notEquals":
      return JSON.stringify(actual) !== JSON.stringify(m.value);
    case "in":
      return asList(m.value).some((v) => JSON.stringify(v) === JSON.stringify(actual));
    case "contains":
      return Array.isArray(actual)
        ? actual.some((v) => JSON.stringify(v) === JSON.stringify(m.value))
        : asText(actual).includes(String(m.value));
    case "startsWith":
      return every(actual, (s) => s.startsWith(String(m.value)));
    case "endsWith":
      return every(actual, (s) => s.endsWith(String(m.value)));
    case "allEndWith": {
      const suffixes = asList(m.value).map(String);
      return every(actual, (s) => suffixes.some((x) => s.toLowerCase().endsWith(x.toLowerCase())));
    }
    case "matches": {
      let re: RegExp;
      try {
        re = new RegExp(String(m.value));
      } catch {
        return false;
      }
      return every(actual, (s) => re.test(s));
    }
  }
}

function every(actual: unknown, test: (s: string) => boolean): boolean {
  const list = asList(actual);
  return list.length > 0 && list.every((v) => typeof v === "string" && test(v));
}

/** Checks a matcher's shape; returns a message for the first problem, or null. */
export function validateMatcher(m: Matcher): string | null {
  if (!m.path.trim()) return "A condition needs an argument path.";
  if (m.op !== "exists" && m.value === undefined) return `"${m.op}" needs a value.`;
  if (m.op === "matches") {
    try {
      new RegExp(String(m.value));
    } catch {
      return `"${String(m.value)}" is not a valid regular expression.`;
    }
  }
  return null;
}
