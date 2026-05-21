import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional CTA — typically a Button. */
  action?: ReactNode;
  /** Optional icon, rendered above the title (lucide-react size 28). */
  icon?: ReactNode;
  className?: string;
}

/**
 * Empty / first-run state. Lives inside Sections and DataGrid emptyState
 * slots — small, low-key, with an optional CTA. Calm tone matches the
 * design system's "calm at rest" guidance.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 py-8 text-center",
        className,
      )}
    >
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <div className="text-[14px] leading-[22px] font-medium text-fg">
        {title}
      </div>
      {description && (
        <div className="max-w-sm text-[13px] leading-[20px] text-fg-muted">
          {description}
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
