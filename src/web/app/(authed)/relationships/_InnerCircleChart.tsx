"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  Event,
  Interaction,
  OpenThread,
  PlatformCommsTouchpoint,
} from "@related/shared";
import {
  innerCircleCloseness,
  CLOSENESS_WEIGHTS,
  type InnerCircleContact,
  type InnerCircleContactInput,
} from "@related/shared";
import { Mono, Pill } from "@/components/ui";

type ClosenessMode = "current" | "allTime";
type CurrentWindow = "30d" | "90d";

const CURRENT_WINDOW_DAYS: Record<CurrentWindow, number> = {
  "30d": 30,
  "90d": 90,
};

const RING_RADII = [36, 64, 92] as const;
const RING_CAPS = [3, 6, 12] as const;
const SVG_SIZE = 280;
const SVG_CX = SVG_SIZE / 2;

const SIGNAL_COLORS = {
  comms: "#5b7cfa",
  notes: "#3d8f6e",
  upcoming: "#ed7a35",
  attended: "#8b6bb8",
  commitments: "#c9a227",
} as const;

const LEGEND: { key: keyof typeof SIGNAL_COLORS; label: string }[] = [
  { key: "comms", label: "Comms" },
  { key: "attended", label: "Attended" },
  { key: "upcoming", label: "Upcoming" },
  { key: "notes", label: "Notes" },
  { key: "commitments", label: "Commits" },
];

interface Props {
  contacts: InnerCircleContactInput[];
  platformComms: PlatformCommsTouchpoint[];
  attendeeEvents: Event[];
  interactions: Interaction[];
  openThreads: OpenThread[];
  contactIdByRelationshipId: Record<string, string>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function ringIndex(rank: number): number {
  if (rank < RING_CAPS[0]) return 0;
  if (rank < RING_CAPS[1]) return 1;
  return 2;
}

function nodePosition(
  rank: number,
  indexOnRing: number,
  countOnRing: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const ring = ringIndex(rank);
  const radius = RING_RADII[ring];
  const angle =
    countOnRing <= 1
      ? -Math.PI / 2
      : (indexOnRing / countOnRing) * Math.PI * 2 - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function InnerCircleSvg({ contacts }: { contacts: InnerCircleContact[] }) {
  const cy = SVG_CX;

  const byRing: InnerCircleContact[][] = [[], [], []];
  for (let i = 0; i < contacts.length; i++) {
    byRing[ringIndex(i)].push(contacts[i]);
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      role="img"
      aria-label="Inner circle closeness"
      className="mx-auto block w-full max-w-[260px]"
    >
      {RING_RADII.map((r, i) => (
        <circle
          key={r}
          cx={SVG_CX}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          className={i === 0 ? "text-border/50" : "text-border"}
          strokeDasharray={i === 0 ? undefined : "4 6"}
          opacity={i === 0 ? 1 : i === 1 ? 0.7 : 1}
        />
      ))}

      <circle
        cx={SVG_CX}
        cy={cy}
        r={14}
        className="fill-bg stroke-border"
        strokeWidth={1}
      />
      <text
        x={SVG_CX}
        y={cy + 3}
        textAnchor="middle"
        className="fill-fg-muted text-[10px] font-medium"
      >
        You
      </text>

      {contacts.map((person, rank) => {
        const ring = ringIndex(rank);
        const peers = byRing[ring];
        const indexOnRing = peers.indexOf(person);
        const { x, y } = nodePosition(
          rank,
          indexOnRing,
          peers.length,
          SVG_CX,
          cy,
        );
        const r = 7 + (person.relativeCloseness / 100) * 6;

        return (
          <g key={person.contactId}>
            <line
              x1={SVG_CX}
              y1={cy}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border/40"
            />
            <circle
              cx={x}
              cy={y}
              r={r}
              fill="#5b7cfa"
              fillOpacity={0.15 + (person.relativeCloseness / 100) * 0.55}
              stroke="#5b7cfa"
              strokeWidth={1.5}
            >
              <title>{`${person.name}: ${person.score} closeness`}</title>
            </circle>
            <text
              x={x}
              y={y + 3}
              textAnchor="middle"
              className="fill-fg font-[family-name:var(--font-jetbrains-mono)] text-[8px] font-semibold"
            >
              {initials(person.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SignalBar({ person }: { person: InnerCircleContact }) {
  const total = person.score || 1;
  const segments = [
    {
      key: "comms" as const,
      label: "Comms",
      value: person.signals.comms * CLOSENESS_WEIGHTS.comms,
    },
    {
      key: "attended" as const,
      label: "Attended",
      value: person.signals.attended * CLOSENESS_WEIGHTS.attended,
    },
    {
      key: "upcoming" as const,
      label: "Upcoming",
      value: person.signals.upcoming * CLOSENESS_WEIGHTS.upcoming,
    },
    {
      key: "notes" as const,
      label: "Notes",
      value: person.signals.notes * CLOSENESS_WEIGHTS.note,
    },
    {
      key: "commitments" as const,
      label: "Commits",
      value: person.signals.commitments * CLOSENESS_WEIGHTS.commitment,
    },
  ].filter((s) => s.value > 0);

  return (
    <div
      className="flex h-1 overflow-hidden rounded-full bg-bg"
      title={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      {segments.map((s) => (
        <span
          key={s.key}
          style={{
            width: `${(s.value / total) * 100}%`,
            backgroundColor: SIGNAL_COLORS[s.key],
          }}
        />
      ))}
    </div>
  );
}

export function InnerCircleChart({
  contacts,
  platformComms,
  attendeeEvents,
  interactions,
  openThreads,
  contactIdByRelationshipId,
}: Props) {
  const [mode, setMode] = useState<ClosenessMode>("current");
  const [currentWindow, setCurrentWindow] = useState<CurrentWindow>("90d");

  const rankings = useMemo(
    () =>
      innerCircleCloseness({
        contacts,
        platformComms,
        events: attendeeEvents,
        interactions,
        openThreads,
        contactIdByRelationshipId,
        windowDays:
          mode === "current" ? CURRENT_WINDOW_DAYS[currentWindow] : null,
      }),
    [
      contacts,
      platformComms,
      attendeeEvents,
      interactions,
      openThreads,
      contactIdByRelationshipId,
      mode,
      currentWindow,
    ],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill active={mode === "current"} onClick={() => setMode("current")}>
          Closest now
        </Pill>
        <Pill active={mode === "allTime"} onClick={() => setMode("allTime")}>
          Closest overall
        </Pill>
        {mode === "current" && (
          <>
            <span className="mx-0.5 h-3.5 w-px bg-border" />
            <Pill
              active={currentWindow === "30d"}
              onClick={() => setCurrentWindow("30d")}
            >
              30d
            </Pill>
            <Pill
              active={currentWindow === "90d"}
              onClick={() => setCurrentWindow("90d")}
            >
              90d
            </Pill>
          </>
        )}
        {rankings.contacts.length > 0 && (
          <>
            <span className="mx-0.5 h-3.5 w-px bg-border" />
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-fg-subtle">
              {LEGEND.map(({ key, label }) => (
                <span key={key} className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-sm"
                    style={{ backgroundColor: SIGNAL_COLORS[key] }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {rankings.contacts.length === 0 ? (
        <p className="text-[12px] leading-[18px] text-fg-muted">
          No closeness signals in this period yet.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-center sm:gap-3">
          <InnerCircleSvg contacts={rankings.contacts} />
          <ol className="min-h-0 space-y-0.5 sm:pt-3">
            {rankings.contacts.map((person, i) => (
              <li
                key={person.contactId}
                className="flex items-center gap-2 rounded-md border border-border/80 bg-bg px-2 py-1"
              >
                <Mono className="w-4 shrink-0 text-[11px] text-fg-subtle">
                  {i + 1}
                </Mono>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      href={`/relationships/${person.relationshipId}`}
                      className="truncate text-[13px] font-medium text-fg hover:underline"
                    >
                      {person.name}
                    </Link>
                    <Mono className="shrink-0 text-[12px] tabular-nums">
                      {person.score}
                      <span className="text-fg-subtle">
                        {" "}
                        · {person.relativeCloseness}%
                      </span>
                    </Mono>
                  </div>
                  <SignalBar person={person} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
