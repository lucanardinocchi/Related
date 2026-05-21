import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

interface ListItemRowProps {
  /** Optional leading slot — typically an icon (User, Users for groups, etc.). */
  leading?: ReactNode;
  /** Primary line — the entity name. */
  title: ReactNode;
  /** Optional secondary line below the title. */
  subtitle?: ReactNode;
  /**
   * Trailing slot — metadata that scans down a column on the right (last
   * seen time, counts, badges). Mono in the value column reads nicely.
   */
  trailing?: ReactNode;
  /**
   * Trailing hover-only actions slot. Appears next to `trailing` on hover
   * (opacity-0 → opacity-100). Use for "Edit", "Delete" — calm at rest,
   * available on demand.
   */
  hoverActions?: ReactNode;
  /** If set, the row renders as a Next.js Link. */
  href?: string;
  /** Otherwise, the row can render as a button with onClick. */
  onClick?: () => void;
  className?: string;
}

/**
 * Row primitive for table-like lists (the Relationships index, Calendar
 * list view, Commitments list, Group members). Hover-reveal density per
 * src/web/CONTEXT.md — calm at rest, affordances on hover.
 */
export function ListItemRow({
  leading,
  title,
  subtitle,
  trailing,
  hoverActions,
  href,
  onClick,
  className,
}: ListItemRowProps) {
  const inner = (
    <div
      className={cn(
        "group flex items-center gap-3 rounded px-2 py-2 text-left transition-colors",
        (href || onClick) && "hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
    >
      {leading && (
        <div className="flex-none text-fg-muted">{leading}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] leading-[22px] text-fg">{title}</div>
        {subtitle && (
          <div className="truncate text-[13px] leading-[20px] text-fg-muted">
            {subtitle}
          </div>
        )}
      </div>
      {(trailing || hoverActions) && (
        <div className="flex flex-none items-center gap-2 text-[13px] text-fg-muted">
          {trailing}
          {hoverActions && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {hoverActions}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full">
        {inner}
      </button>
    );
  }
  return inner;
}
