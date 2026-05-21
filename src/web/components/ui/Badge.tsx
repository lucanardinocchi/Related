import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "draft"
  | "approved"
  | "sent"
  | "review"
  | "won"
  | "lost"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

// Soft tinted backgrounds with darker foregrounds; matches the Notion
// status-pill convention. Subtle enough to coexist on a dense row without
// shouting.
const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-hover text-fg-muted",
  draft: "bg-[var(--color-status-draft-bg)] text-[var(--color-status-draft)]",
  approved:
    "bg-[var(--color-status-approved-bg)] text-[var(--color-status-approved)]",
  sent: "bg-[var(--color-status-sent-bg)] text-[var(--color-status-sent)]",
  review: "bg-[var(--color-status-review-bg)] text-[var(--color-status-review)]",
  won: "bg-[var(--color-status-won-bg)] text-[var(--color-status-won)]",
  lost: "bg-[var(--color-status-lost-bg)] text-[var(--color-status-lost)]",
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

/**
 * Compact status pill. Used in rows and on cards for state callouts
 * (Interaction status, Commitment communication_status, calendar event
 * source badges, etc.).
 */
export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-1.5 py-[1px] text-[11px] font-medium leading-[16px]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
