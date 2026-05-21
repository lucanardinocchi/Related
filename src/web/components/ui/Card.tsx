import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Soft surface for analytics panels and contextual asides. Intentionally
 * borderless — reads as a tonal lift rather than a framed box so stacked
 * cards don't accumulate into a "boxy" page.
 */
export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface AnalyticsRowProps {
  children: ReactNode;
  className?: string;
}

/**
 * Horizontal row of AnalyticTiles for the top of index pages. Frameless and
 * gap-based (no divide-x compartments) so it reads as a row of metrics
 * rather than a grid of boxes.
 */
export function AnalyticsRow({ children, className }: AnalyticsRowProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-10 gap-y-4 py-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface AnalyticTileProps {
  label: string;
  value: ReactNode;
  /** Optional small line under the value (e.g. delta vs last 30d). */
  hint?: ReactNode;
  className?: string;
}

/**
 * One number in an analytics row. Mono on the value so multiple tiles
 * line up under each other when stacked.
 */
export function AnalyticTile({
  label,
  value,
  hint,
  className,
}: AnalyticTileProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </div>
      <div className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[20px] leading-[28px] tabular-nums text-fg">
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[13px] leading-[20px] text-fg-muted">
          {hint}
        </div>
      )}
    </div>
  );
}
