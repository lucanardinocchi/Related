"use client";

import { useMemo, useState } from "react";
import type {
  CalendarEvent,
  CalendarEventOverlay,
  Interaction,
  InteractionCategory,
  InteractionStatus,
} from "@related/shared";
import { cumulativeGrowth } from "@related/shared";
import { Card, Eyebrow, H2, Pill } from "@/components/ui";

type Tab =
  | { axis: "status"; value: InteractionStatus; label: string }
  | { axis: "category"; value: InteractionCategory; label: string };

const STATUS_TABS: Tab[] = [
  { axis: "status", value: "attended", label: "Attended" },
  { axis: "status", value: "missed", label: "Missed" },
  { axis: "status", value: "cancelled", label: "Cancelled" },
  { axis: "status", value: "planned", label: "Upcoming" },
];

const CATEGORY_TABS: Tab[] = [
  { axis: "category", value: "work", label: "Work" },
  { axis: "category", value: "meeting", label: "Meeting" },
  { axis: "category", value: "activity", label: "Activity" },
  { axis: "category", value: "personal", label: "Personal" },
  { axis: "category", value: "errands", label: "Errands" },
];

type Scope = "past" | "future";

interface Props {
  interactions: Interaction[];
  externalEvents: CalendarEvent[];
  overlays: CalendarEventOverlay[];
  now: Date;
}

function fmtAxis(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Cumulative line chart for Calendar entries — mirrors the screenshot
 * reference: monospace y-axis ticks, dashed gridlines, orange accent
 * line. Hand-rolled SVG (no charting dep). Two filter axes:
 *
 *  - Scope pills (Past / Future) pick the 30-day window relative to today.
 *  - Tabs in the upper-right pick which series to plot — a status
 *    (attended / missed / cancelled / upcoming) or a category.
 *
 * "Upcoming" only makes sense for the future scope; the other status
 * tabs only show in the past scope. Categories work in both scopes.
 */
export function CumulativeGrowthChart({
  interactions,
  externalEvents,
  overlays,
  now,
}: Props) {
  const [scope, setScope] = useState<Scope>("past");
  // Default tab depends on scope.
  const [statusTab, setStatusTab] = useState<Tab>(STATUS_TABS[0]);
  const [categoryTab, setCategoryTab] = useState<Tab | null>(null);
  // The currently-selected tab — categoryTab wins if set, else the
  // status tab valid for this scope.
  const activeTab: Tab = useMemo(() => {
    if (categoryTab) return categoryTab;
    if (scope === "future") {
      return (
        STATUS_TABS.find((t) => t.value === "planned") ?? STATUS_TABS[0]
      );
    }
    return statusTab.value === "planned" ? STATUS_TABS[0] : statusTab;
  }, [categoryTab, scope, statusTab]);

  const [from, to] = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    if (scope === "past") {
      return [new Date(now.getTime() - 30 * day), now];
    }
    return [now, new Date(now.getTime() + 30 * day)];
  }, [scope, now]);

  const buckets = useMemo(
    () =>
      cumulativeGrowth({
        from: from.toISOString(),
        to: to.toISOString(),
        interactions,
        externalEvents,
        overlays,
        filter: { axis: activeTab.axis, value: activeTab.value } as
          | { axis: "status"; value: InteractionStatus }
          | { axis: "category"; value: InteractionCategory },
      }),
    [activeTab, externalEvents, from, interactions, overlays, to],
  );

  const max = Math.max(1, ...buckets.map((b) => b.count));
  // Round the upper bound up to a friendly tick (10 for <=10, etc.).
  const niceMax = max <= 3 ? 3 : max <= 6 ? 6 : max <= 10 ? 10 : Math.ceil(max / 5) * 5;
  // Y ticks at 0, niceMax/3-ish marks. Three intermediates so the grid
  // matches the reference (10 / 6 / 3 / 0 style).
  const yTicks = [0, Math.round(niceMax / 3), Math.round((niceMax * 2) / 3), niceMax];

  // SVG layout: viewBox-driven so it scales fluidly.
  const W = 1000;
  const H = 240;
  const PAD_L = 56;
  const PAD_R = 24;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xAt = (i: number) =>
    PAD_L + (buckets.length > 1 ? (i / (buckets.length - 1)) * innerW : 0);
  const yAt = (count: number) =>
    PAD_T + innerH - (count / niceMax) * innerH;

  const path = buckets
    .map((b, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(b.count).toFixed(1)}`)
    .join(" ");

  // X labels — every ~6th day so we don't overcrowd the axis.
  const xLabelIndices = buckets
    .map((_, i) => i)
    .filter((i) => buckets.length <= 1 || i % Math.max(1, Math.floor((buckets.length - 1) / 4)) === 0);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Activity</Eyebrow>
          <H2 className="mt-1">Cumulative Growth</H2>
          <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
            Total accumulated over the {scope === "past" ? "last" : "next"} 30 days
            {activeTab.axis === "status"
              ? ` — ${activeTab.label.toLowerCase()}`
              : ` — ${activeTab.label.toLowerCase()} events`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-pill bg-bg p-1">
          {(scope === "past" ? STATUS_TABS.filter((t) => t.value !== "planned") : [STATUS_TABS[3]]).map((t) => (
            <button
              key={`status-${t.value}`}
              type="button"
              onClick={() => {
                setStatusTab(t);
                setCategoryTab(null);
              }}
              className={
                activeTab === t
                  ? "rounded-pill bg-surface px-3 py-1 text-[13px] font-medium text-fg shadow-sm"
                  : "rounded-pill px-3 py-1 text-[13px] font-medium text-fg-muted hover:text-fg"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill active={scope === "past"} onClick={() => setScope("past")}>
          Past 30 days
        </Pill>
        <Pill active={scope === "future"} onClick={() => setScope("future")}>
          Next 30 days
        </Pill>
        <span className="mx-2 h-4 w-px bg-border" />
        <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
          Type:
        </span>
        <Pill active={categoryTab === null} onClick={() => setCategoryTab(null)}>
          All
        </Pill>
        {CATEGORY_TABS.map((t) => (
          <Pill
            key={`cat-${t.value}`}
            active={categoryTab?.value === t.value}
            onClick={() => setCategoryTab(t)}
          >
            {t.label}
          </Pill>
        ))}
      </div>

      <div className="mt-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Cumulative ${activeTab.label} growth`}
          className="block w-full"
        >
          {/* Y gridlines */}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="4 4"
                className="text-border"
              />
              <text
                x={PAD_L - 12}
                y={yAt(t) + 4}
                textAnchor="end"
                className="fill-fg-muted font-[family-name:var(--font-jetbrains-mono)] text-[12px]"
              >
                {t}
              </text>
            </g>
          ))}

          {/* Line */}
          {buckets.length > 0 && (
            <path
              d={path}
              fill="none"
              stroke="#ed7a35"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* X tick labels */}
          {xLabelIndices.map((i) => (
            <text
              key={`x-${i}`}
              x={xAt(i)}
              y={H - PAD_B + 18}
              textAnchor="middle"
              className="fill-fg-muted text-[12px]"
            >
              {fmtAxis(buckets[i].date)}
            </text>
          ))}
        </svg>
      </div>
    </Card>
  );
}
