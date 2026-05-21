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
  | { axis: "all"; label: string }
  | { axis: "status"; value: InteractionStatus; label: string }
  | { axis: "category"; value: InteractionCategory; label: string };

const ALL_TAB: Tab = { axis: "all", label: "All" };

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

function tabKey(t: Tab): string {
  return t.axis === "all" ? "all" : `${t.axis}:${t.value}`;
}

/**
 * Cumulative line chart for Calendar entries — mirrors the screenshot
 * reference: monospace y-axis ticks, dashed gridlines, orange accent
 * line. Hand-rolled SVG (no charting dep). Three filter axes:
 *
 *  - Scope pills (Past / Future) pick the 30-day window relative to today.
 *  - Status tabs in the upper-right pick a series (attended / missed /
 *    cancelled / upcoming). Past scope hides "Upcoming"; future scope
 *    only shows "Upcoming".
 *  - Type pills below the chart further narrow to one category, or
 *    "All" for the unfiltered total. Defaults to "All" so the chart
 *    shows the User's whole calendar before any narrowing.
 */
export function CumulativeGrowthChart({
  interactions,
  externalEvents,
  overlays,
  now,
}: Props) {
  const [scope, setScope] = useState<Scope>("past");
  const [activeTab, setActiveTab] = useState<Tab>(ALL_TAB);

  // Tabs available for the right-hand status switcher in the current scope.
  const scopeStatusTabs = useMemo(
    () =>
      scope === "past"
        ? STATUS_TABS.filter((t) => t.axis === "status" && t.value !== "planned")
        : STATUS_TABS.filter((t) => t.axis === "status" && t.value === "planned"),
    [scope],
  );

  function selectScope(next: Scope) {
    setScope(next);
    // If the current status tab isn't valid in the new scope, fall back to All.
    if (activeTab.axis === "status") {
      const stillValid = (
        next === "past"
          ? activeTab.value !== "planned"
          : activeTab.value === "planned"
      );
      if (!stillValid) setActiveTab(ALL_TAB);
    }
  }

  const [from, to] = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    if (scope === "past") {
      return [new Date(now.getTime() - 30 * day), now];
    }
    return [now, new Date(now.getTime() + 30 * day)];
  }, [scope, now]);

  const buckets = useMemo(() => {
    const filter =
      activeTab.axis === "all"
        ? { axis: "all" as const }
        : activeTab.axis === "status"
          ? { axis: "status" as const, value: activeTab.value }
          : { axis: "category" as const, value: activeTab.value };
    return cumulativeGrowth({
      from: from.toISOString(),
      to: to.toISOString(),
      interactions,
      externalEvents,
      overlays,
      filter,
    });
  }, [activeTab, externalEvents, from, interactions, overlays, to]);

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const niceMax = max <= 3 ? 3 : max <= 6 ? 6 : max <= 10 ? 10 : Math.ceil(max / 5) * 5;
  const yTicks = [
    0,
    Math.round(niceMax / 3),
    Math.round((niceMax * 2) / 3),
    niceMax,
  ];

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

  const xLabelIndices = buckets
    .map((_, i) => i)
    .filter(
      (i) =>
        buckets.length <= 1 ||
        i % Math.max(1, Math.floor((buckets.length - 1) / 4)) === 0,
    );

  const description =
    activeTab.axis === "all"
      ? `Total accumulated over the ${scope === "past" ? "last" : "next"} 30 days`
      : activeTab.axis === "status"
        ? `${activeTab.label} — ${scope === "past" ? "last" : "next"} 30 days`
        : `${activeTab.label} events — ${scope === "past" ? "last" : "next"} 30 days`;

  const activeKey = tabKey(activeTab);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Activity</Eyebrow>
          <H2 className="mt-1">Cumulative Growth</H2>
          <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-pill bg-bg p-1">
          {[ALL_TAB, ...scopeStatusTabs].map((t) => {
            const key = tabKey(t);
            const active = activeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(t)}
                className={
                  active
                    ? "rounded-pill bg-surface px-3 py-1 text-[13px] font-medium text-fg shadow-sm"
                    : "rounded-pill px-3 py-1 text-[13px] font-medium text-fg-muted hover:text-fg"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill active={scope === "past"} onClick={() => selectScope("past")}>
          Past 30 days
        </Pill>
        <Pill active={scope === "future"} onClick={() => selectScope("future")}>
          Next 30 days
        </Pill>
        <span className="mx-2 h-4 w-px bg-border" />
        <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
          Type:
        </span>
        <Pill
          active={activeTab.axis !== "category"}
          onClick={() => setActiveTab(ALL_TAB)}
        >
          All
        </Pill>
        {CATEGORY_TABS.map((t) => (
          <Pill
            key={tabKey(t)}
            active={activeKey === tabKey(t)}
            onClick={() => setActiveTab(t)}
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
