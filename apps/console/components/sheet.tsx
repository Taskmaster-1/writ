"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/** A panel that slides over the page from the right (full screen on phones). */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start focus on the panel, not the close button, so nothing looks pre-selected.
      dialog.querySelector<HTMLElement>("[data-panel]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: clicking the backdrop closes; Escape is handled by <dialog> itself
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-full bg-transparent p-0 backdrop:bg-black/30 sm:max-w-[var(--w)]"
      style={{ ["--w" as string]: `${width}px` }}
    >
      {open ? (
        <div
          data-panel
          tabIndex={-1}
          className="enter flex h-full flex-col border-l border-line bg-surface outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-fg">{title}</h2>
              {description ? (
                <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              aria-label="Close"
            >
              <X />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
