"use client";

import { useMemo, useState } from "react";
import type { Event, EventStatus, EventType } from "@related/shared";
import { eventsPerDay } from "@related/shared";
import { Card, Eyebrow, H2, Pill } from "@/components/ui";

type Tab =
  | { axis: "all"; label: string }
  | { axis: "status"; value: EventStatus; label: string }
  | { axis: "type"; value: EventType; label: string };

const ALL_TAB: Tab = { axis: "all", label: "All" };

const STATUS_TABS: Tab[] = [
  { axis: "status", value: "attended", label: "Attended" },
  { axis: "status", value: "occurred", label: "Occurred" },
  { axis: "status", value: "missed", label: "Missed" },
  { axis: "status", value: "cancelled", label: "Cancelled" },
  { axis: "status", value: "planned", label: "Upcoming" },
];

const TYPE_TABS: Tab[] = [
  { axis: "type", value: "work", label: "Work" },
  { axis: "type", value: "meeting", label: "Meeting" },
  { axis: "type", value: "uni", label: "Uni" },
  { axis: "type", value: "personal", label: "Personal" },
  { axis: "type", value: "activity", label: "Activity" },
];

type Scope = "past" | "future";

interface Props {
  events: Event[];
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
 * Vertical bar chart of Calendar entries per day. One bar per day in the
 * 30-day window so empty days show as gaps — gives a read on activity
 * density rather than a running total. Self-contained: scope pills pick
 * Past/Future, status tabs in the header pick a series, type pills below
 * narrow further.
 */
export function EventsBarChart({ events, now }: Props) {
  const [scope, setScope] = useState<Scope>("future");
  const [activeTab, setActiveTab] = useState<Tab>(ALL_TAB);

  const scopeStatusTabs = useMemo(
    () =>
      scope === "past"
        ? STATUS_TABS.filter(
            (t) => t.axis === "status" && t.value !== "planned",
          )
        : STATUS_TABS.filter(
            (t) => t.axis === "status" && t.value === "planned",
          ),
    [scope],
  );

  function selectScope(next: Scope) {
    setScope(next);
    if (activeTab.axis === "status") {
      const stillValid =
        next === "past"
          ? activeTab.value !== "planned"
          : activeTab.value === "planned";
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
          : { axis: "type" as const, value: activeTab.value };
    return eventsPerDay({
      from: from.toISOString(),
      to: to.toISOString(),
      events,
      filter,
    });
  }, [activeTab, events, from, to]);

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const niceMax =
    max <= 3 ? 3 : max <= 6 ? 6 : max <= 10 ? 10 : Math.ceil(max / 5) * 5;
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

  // One slot per day. Bar takes 70% of the slot — leaves a visible gap
  // between bars but not so much that the columns feel sparse.
  const slot = buckets.length > 0 ? innerW / buckets.length : 0;
  const barW = Math.max(2, slot * 0.7);
  const xAt = (i: number) => PAD_L + i * slot + (slot - barW) / 2;
  const yAt = (count: number) =>
    PAD_T + innerH - (count / niceMax) * innerH;

  const xLabelIndices = buckets
    .map((_, i) => i)
    .filter(
      (i) =>
        buckets.length <= 1 ||
        i % Math.max(1, Math.floor((buckets.length - 1) / 4)) === 0,
    );

  const description =
    activeTab.axis === "all"
      ? `Events per day over the ${scope === "past" ? "last" : "next"} 30 days`
      : activeTab.axis === "status"
        ? `${activeTab.label} — ${scope === "past" ? "last" : "next"} 30 days`
        : `${activeTab.label} events — ${scope === "past" ? "last" : "next"} 30 days`;

  const activeKey = tabKey(activeTab);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Activity</Eyebrow>
          <H2 className="mt-1">Events per Day</H2>
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
        <Pill
          active={scope === "future"}
          onClick={() => selectScope("future")}
        >
          Next 30 days
        </Pill>
        <span className="mx-2 h-4 w-px bg-border" />
        <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
          Type:
        </span>
        <Pill
          active={activeTab.axis !== "type"}
          onClick={() => setActiveTab(ALL_TAB)}
        >
          All
        </Pill>
        {TYPE_TABS.map((t) => (
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
          aria-label={`${activeTab.label} events per day`}
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

          {buckets.map((b, i) => {
            if (b.count === 0) return null;
            const y = yAt(b.count);
            const h = PAD_T + innerH - y;
            return (
              <rect
                key={`bar-${b.date}`}
                x={xAt(i)}
                y={y}
                width={barW}
                height={h}
                rx={2}
                fill="#ed7a35"
              >
                <title>{`${fmtAxis(b.date)}: ${b.count}`}</title>
              </rect>
            );
          })}

          {xLabelIndices.map((i) => (
            <text
              key={`x-${i}`}
              x={xAt(i) + barW / 2}
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
