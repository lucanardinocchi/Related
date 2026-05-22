"use client";

import { useMemo, useState } from "react";
import type {
  Event,
  Interaction,
  OpenThread,
  PlatformCommsTouchpoint,
} from "@related/shared";
import {
  peopleAddedPerDay,
  groupsAddedPerDay,
  averageInteractionsByRelationshipAge,
  type InnerCircleContactInput,
} from "@related/shared";
import { Card, Eyebrow, H2, Pill } from "@/components/ui";
import { InnerCircleChart } from "./_InnerCircleChart";

type AnalyticsSection = "growth" | "engagement" | "inner";
type GrowthChart = "people" | "groups";
type DayWindow = "14d" | "30d" | "90d" | "1y";

const DAY_MS = 24 * 60 * 60 * 1000;

const SECTION_TABS: { id: AnalyticsSection; label: string }[] = [
  { id: "growth", label: "Growth" },
  { id: "engagement", label: "Engagement" },
  { id: "inner", label: "Inner circle" },
];

const AGE_COLORS: Record<string, string> = {
  new: "#ed7a35",
  growing: "#3d8f6e",
  established: "#5b7cfa",
  longTerm: "#8b6bb8",
};

const AGE_LABELS: Record<string, string> = {
  new: "< 30 days",
  growing: "30–180 days",
  established: "180–365 days",
  longTerm: "1+ year",
};

const DAY_WINDOW_DAYS: Record<DayWindow, number> = {
  "14d": 14,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

const DAY_WINDOW_LABELS: Record<DayWindow, string> = {
  "14d": "14 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
};

const SECTION_META: Record<
  AnalyticsSection,
  { eyebrow: string; title: string; description: string }
> = {
  growth: {
    eyebrow: "Growth",
    title: "New per Day",
    description: "How many contacts or groups you added each day.",
  },
  engagement: {
    eyebrow: "Engagement",
    title: "Average Interactions by Relationship Length",
    description:
      "Mean occurred interactions in the window, grouped by how long you have known each person.",
  },
  inner: {
    eyebrow: "Inner circle",
    title: "Who you're closest with",
    description:
      "Ranked by synced comms, calendar events together, context notes, and commitments — inner rings are closer relationships.",
  },
};

interface Props {
  peopleCreatedAts: string[];
  groupCreatedAts: string[];
  interactions: Interaction[];
  relationshipCreatedAtByContactId: Record<string, string>;
  innerCircleContacts: InnerCircleContactInput[];
  platformComms: PlatformCommsTouchpoint[];
  attendeeEvents: Event[];
  openThreads: OpenThread[];
  contactIdByRelationshipId: Record<string, string>;
}

function fmtDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function windowRange(now: Date, days: number): [Date, Date] {
  return [new Date(now.getTime() - days * DAY_MS), now];
}

function niceMax(max: number): number {
  if (max <= 3) return 3;
  if (max <= 6) return 6;
  if (max <= 10) return 10;
  return Math.ceil(max / 5) * 5;
}

function SimpleBarChart({
  buckets,
  title,
  barColor = "#ed7a35",
}: {
  buckets: { label: string; count: number; color?: string }[];
  title: string;
  barColor?: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const yMax = niceMax(max);
  const yTicks = [0, Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax];

  const W = 1000;
  const H = 220;
  const PAD_L = 56;
  const PAD_R = 24;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const slot = buckets.length > 0 ? innerW / buckets.length : 0;
  const barW = Math.max(2, slot * 0.7);
  const xAt = (i: number) => PAD_L + i * slot + (slot - barW) / 2;
  const yAt = (count: number) => PAD_T + innerH - (count / yMax) * innerH;

  const xLabelIndices = buckets
    .map((_, i) => i)
    .filter(
      (i) =>
        buckets.length <= 1 ||
        i % Math.max(1, Math.floor((buckets.length - 1) / 4)) === 0,
    );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title}
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
            key={`bar-${b.label}`}
            x={xAt(i)}
            y={y}
            width={barW}
            height={h}
            rx={2}
            fill={b.color ?? barColor}
          >
            <title>{`${b.label}: ${b.count}`}</title>
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
          {buckets[i].label}
        </text>
      ))}
    </svg>
  );
}

function SectionToggle({
  active,
  onChange,
}: {
  active: AnalyticsSection;
  onChange: (s: AnalyticsSection) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-pill bg-bg p-1 w-fit">
      {SECTION_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={
            active === tab.id
              ? "rounded-pill bg-surface px-3 py-1 text-[13px] font-medium text-fg shadow-sm"
              : "rounded-pill px-3 py-1 text-[13px] font-medium text-fg-muted hover:text-fg"
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DayWindowPills({
  active,
  onChange,
}: {
  active: DayWindow;
  onChange: (w: DayWindow) => void;
}) {
  return (
    <>
      {(Object.keys(DAY_WINDOW_DAYS) as DayWindow[]).map((w) => (
        <Pill key={w} active={active === w} onClick={() => onChange(w)}>
          {DAY_WINDOW_LABELS[w]}
        </Pill>
      ))}
    </>
  );
}

export function RelationshipsIndexCharts({
  peopleCreatedAts,
  groupCreatedAts,
  interactions,
  relationshipCreatedAtByContactId,
  innerCircleContacts,
  platformComms,
  attendeeEvents,
  openThreads,
  contactIdByRelationshipId,
}: Props) {
  const now = useMemo(() => new Date(), []);
  const [section, setSection] = useState<AnalyticsSection>("growth");
  const [growthChart, setGrowthChart] = useState<GrowthChart>("people");
  const [dayWindow, setDayWindow] = useState<DayWindow>("30d");

  const windowDays = DAY_WINDOW_DAYS[dayWindow];

  const [from, to] = useMemo(
    () => windowRange(now, windowDays),
    [now, windowDays],
  );

  const peopleBuckets = useMemo(
    () =>
      peopleAddedPerDay({
        createdAts: peopleCreatedAts,
        from: from.toISOString(),
        to: to.toISOString(),
      }).map((b) => ({ label: fmtDay(b.date), count: b.count })),
    [peopleCreatedAts, from, to],
  );

  const groupBuckets = useMemo(
    () =>
      groupsAddedPerDay({
        createdAts: groupCreatedAts,
        from: from.toISOString(),
        to: to.toISOString(),
      }).map((b) => ({ label: fmtDay(b.date), count: b.count })),
    [groupCreatedAts, from, to],
  );

  const engagementBuckets = useMemo(
    () =>
      averageInteractionsByRelationshipAge({
        interactions,
        relationshipCreatedAtByContactId,
        from: from.toISOString(),
        to: to.toISOString(),
      }).map((b) => ({
        label: AGE_LABELS[b.band],
        count: b.averageInteractions ?? 0,
        color: AGE_COLORS[b.band],
      })),
    [interactions, relationshipCreatedAtByContactId, from, to],
  );

  const meta = SECTION_META[section];
  const growthTitle =
    growthChart === "people" ? "New People per Day" : "New Groups per Day";

  return (
    <div className="space-y-3">
      <SectionToggle active={section} onChange={setSection} />

      <Card>
        <Eyebrow>{meta.eyebrow}</Eyebrow>
        <H2 className="mt-1">
          {section === "growth" ? growthTitle : meta.title}
        </H2>
        <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
          {meta.description}
          {(section === "growth" || section === "engagement") &&
            ` Last ${DAY_WINDOW_LABELS[dayWindow]}.`}
        </p>

        {section === "growth" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill
              active={growthChart === "people"}
              onClick={() => setGrowthChart("people")}
            >
              People
            </Pill>
            <Pill
              active={growthChart === "groups"}
              onClick={() => setGrowthChart("groups")}
            >
              Groups
            </Pill>
            <span className="mx-1 h-4 w-px bg-border" />
            <DayWindowPills active={dayWindow} onChange={setDayWindow} />
          </div>
        )}

        {section === "engagement" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DayWindowPills active={dayWindow} onChange={setDayWindow} />
          </div>
        )}

        <div className="mt-5">
          {section === "growth" && growthChart === "people" && (
            <SimpleBarChart
              buckets={peopleBuckets}
              title="New people per day"
            />
          )}
          {section === "growth" && growthChart === "groups" && (
            <SimpleBarChart
              buckets={groupBuckets}
              title="New groups per day"
              barColor="#3d8f6e"
            />
          )}
          {section === "engagement" && (
            <div>
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
                {Object.entries(AGE_LABELS).map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-[12px] text-fg-muted"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: AGE_COLORS[key] }}
                    />
                    {label}
                  </div>
                ))}
              </div>
              <SimpleBarChart
                buckets={engagementBuckets}
                title="Average interactions by relationship length"
              />
            </div>
          )}
          {section === "inner" && (
            <InnerCircleChart
              contacts={innerCircleContacts}
              platformComms={platformComms}
              attendeeEvents={attendeeEvents}
              interactions={interactions}
              openThreads={openThreads}
              contactIdByRelationshipId={contactIdByRelationshipId}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
