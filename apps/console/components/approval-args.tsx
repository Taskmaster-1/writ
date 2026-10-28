import { pretty } from "@/lib/format";

/**
 * A call's arguments as a person reads them: one row per field, strings as text, lists as chips.
 * Anything nested falls back to JSON, so nothing is ever hidden.
 */
export function ArgumentList({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return <p className="text-fg-muted">No arguments.</p>;
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {entries.map(([key, value]) => (
        <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
          <dt className="pt-px font-mono text-[12px] text-fg-faint">{key}</dt>
          <dd className="min-w-0 text-fg">
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Value({ value }: { value: unknown }) {
  if (typeof value === "string")
    return value ? (
      <span className="whitespace-pre-wrap break-words">{value}</span>
    ) : (
      <span className="text-fg-faint">empty</span>
    );
  if (typeof value === "number" || typeof value === "boolean")
    return <span className="tabular font-mono text-[13px]">{String(value)}</span>;
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number"))
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: values can repeat; order is the identity
            key={i}
            className="rounded-md bg-sunken px-2 py-0.5 text-[13px] text-fg"
          >
            {String(v)}
          </span>
        ))}
      </span>
    );
  return (
    <pre className="overflow-auto font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
      {pretty(value)}
    </pre>
  );
}
