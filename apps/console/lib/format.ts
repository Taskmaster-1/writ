const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size || unit === "minute")
      return fmt.format(Math.round(seconds / size), unit);
  return "just now";
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** `send_email` → "send email", `createEvent` → "create event". */
export function humanize(tool: string): string {
  return tool
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

/** A call's tool without its upstream prefix: `demo__send_email` → `send_email`. */
export function toolName(call: { tool: string; upstream: string | null }): string {
  return call.upstream ? call.tool.slice(call.upstream.length + 2) : call.tool;
}
