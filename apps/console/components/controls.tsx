"use client";

import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cx } from "@/lib/format";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-fg" : "bg-line-strong",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-4 rounded-full bg-bg shadow transition-[left]",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-sunken p-0.5"
    >
      {options.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: a styled segmented control; role=radio with aria-checked is the accessible pattern
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-7 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A value to copy: a token, a URL, a command. */
export function CopyBox({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative rounded-lg border border-line bg-sunken">
      <pre
        className={cx(
          "overflow-x-auto px-3 py-2.5 pr-20 font-mono text-[12.5px] text-fg",
          multiline ? "whitespace-pre" : "whitespace-nowrap",
        )}
      >
        {value}
      </pre>
      <button
        type="button"
        className="btn btn-sm absolute top-1.5 right-1.5"
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check className="text-ok" /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
