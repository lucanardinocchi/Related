import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DataGridColumn<T> {
  key: string;
  header: ReactNode;
  /** Render a cell from a row. */
  cell: (row: T) => ReactNode;
  /**
   * Tailwind grid template fragment for this column's width — e.g. "1fr",
   * "200px", "minmax(160px, 1fr)". Required so the parent can compose
   * gridTemplateColumns deterministically.
   */
  width: string;
  /** Right-align text (e.g. counts, dates). */
  align?: "left" | "right";
  /** Use mono font in cells (for IDs, durations, dates). */
  mono?: boolean;
  className?: string;
}

interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  /** Stable key per row — used for React key. */
  rowKey: (row: T) => string;
  /** Optional click handler — turns each row into a button. */
  onRowClick?: (row: T) => void;
  /** Optional link href per row. Takes precedence over onRowClick. */
  rowHref?: (row: T) => string | undefined;
  /** Rendered when rows is empty. */
  emptyState?: ReactNode;
  className?: string;
}

/**
 * Notion-style table grid for the dense list views (Relationships index,
 * Calendar list). Header row sits above; body rows reveal subtle hover
 * state. Columns specify their own widths so the layout is declarative and
 * matches across header and rows.
 */
export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowHref,
  emptyState,
  className,
}: DataGridProps<T>) {
  const gridTemplateColumns = columns.map((c) => c.width).join(" ");

  if (rows.length === 0) {
    return <div className={cn("py-8 text-center", className)}>{emptyState}</div>;
  }

  return (
    <div className={cn("w-full", className)}>
      <div
        className="grid border-b border-divider px-2 pb-1.5"
        style={{ gridTemplateColumns }}
        role="row"
      >
        {columns.map((c) => (
          <div
            key={c.key}
            className={cn(
              "text-[11px] uppercase tracking-[0.06em] text-fg-subtle",
              c.align === "right" && "text-right",
              c.className,
            )}
            role="columnheader"
          >
            {c.header}
          </div>
        ))}
      </div>
      <div role="rowgroup" className="pt-1">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const inner = (
            <div
              className="grid rounded-md px-2 py-2 transition-colors hover:bg-surface"
              style={{ gridTemplateColumns }}
              role="row"
            >
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    "min-w-0 truncate text-[14px] leading-[22px] text-fg",
                    c.align === "right" && "text-right",
                    c.mono &&
                      "font-[family-name:var(--font-jetbrains-mono)] text-[13px] tabular-nums",
                    c.className,
                  )}
                  role="cell"
                >
                  {c.cell(row)}
                </div>
              ))}
            </div>
          );
          if (href) {
            return (
              <a key={rowKey(row)} href={href} className="block">
                {inner}
              </a>
            );
          }
          if (onRowClick) {
            return (
              <button
                key={rowKey(row)}
                type="button"
                onClick={() => onRowClick(row)}
                className="block w-full text-left"
              >
                {inner}
              </button>
            );
          }
          return <div key={rowKey(row)}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
