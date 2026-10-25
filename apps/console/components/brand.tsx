/**
 * The mark: a document corner folded over a seal. A writ is a written order; the seal is
 * what makes it binding.
 */
export function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path
        d="M4 2.5h8.5L16 6v11.5H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 2.5V6H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="12" r="3" fill="var(--seal)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-fg">
      <Mark />
      writ
    </span>
  );
}
