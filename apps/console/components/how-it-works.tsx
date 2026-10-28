import { Ban, BookOpen, Hand, NotebookPen } from "lucide-react";
import { cx } from "@/lib/format";

const STEPS = [
  {
    icon: BookOpen,
    tone: "text-ok",
    title: "Reading just runs",
    body: "Searching your inbox, listing issues, looking things up.",
  },
  {
    icon: Hand,
    tone: "text-seal",
    title: "Acting waits for you",
    body: "Sending email, merging code, booking meetings. You approve or deny it here.",
  },
  {
    icon: Ban,
    tone: "text-danger",
    title: "What you forbid never happens",
    body: "Deleting anything, emailing strangers: whatever your rules block.",
  },
  {
    icon: NotebookPen,
    tone: "text-paper-ink",
    title: "Everything is written down",
    body: "Which agent did what, when, and who said yes.",
  },
];

/**
 * Writ in plain words, for people who have never heard of MCP: what happens to the things an
 * agent tries to do. Shown where someone meets Writ for the first time.
 */
export function HowItWorks({ className }: { className?: string }) {
  return (
    <ul className={cx("grid gap-3 sm:grid-cols-2", className)}>
      {STEPS.map((s) => {
        const Icon = s.icon;
        return (
          <li key={s.title} className="flex gap-3 rounded-xl bg-surface/70 px-4 py-3.5">
            <Icon className={cx("mt-0.5 size-[18px] shrink-0", s.tone)} />
            <div>
              <p className="font-medium text-fg">{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The one-paragraph pitch that sits above `HowItWorks`. */
export function WritInBrief() {
  return (
    <>
      <p className="label">What is Writ?</p>
      <h2 className="mt-2 font-serif text-[26px] leading-[1.2] font-medium text-fg sm:text-[30px]">
        A checkpoint between your AI agents and your tools.
      </h2>
      <p className="mt-3 max-w-[560px] text-[14.5px] leading-relaxed text-fg-muted">
        Agents like Claude Code and Cursor can now send email, merge code and change your calendar.
        Writ works like the text your bank sends before a large payment: small, everyday things go
        through, and anything that matters waits for your yes.
      </p>
    </>
  );
}
