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

const RING_RADII = [52, 96, 140] as const;
const RING_CAPS = [3, 6, 12] as const;

const SIGNAL_COLORS = {
  comms: "#5b7cfa",
  notes: "#3d8f6e",
  upcoming: "#ed7a35",
  attended: "#8b6bb8",
  commitments: "#c9a227",
} as const;

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
  const cx = 200;
  const cy = 200;
  const size = 400;

  const byRing: InnerCircleContact[][] = [[], [], []];
  for (let i = 0; i < contacts.length; i++) {
    byRing[ringIndex(i)].push(contacts[i]);
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Inner circle closeness"
      className="mx-auto block w-full max-w-[400px]"
    >
      <circle
        cx={cx}
        cy={cy}
        r={RING_RADII[2]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        className="text-border"
        strokeDasharray="4 6"
      />
      <circle
        cx={cx}
        cy={cy}
        r={RING_RADII[1]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        className="text-border/70"
        strokeDasharray="4 6"
      />
      <circle
        cx={cx}
        cy={cy}
        r={RING_RADII[0]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        className="text-border/50"
      />

      <circle
        cx={cx}
        cy={cy}
        r={18}
        className="fill-bg stroke-border"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-fg-muted text-[11px] font-medium"
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
          cx,
          cy,
        );
        const r = 10 + (person.relativeCloseness / 100) * 10;

        return (
          <g key={person.contactId}>
            <line
              x1={cx}
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
              className="fill-fg font-[family-name:var(--font-jetbrains-mono)] text-[9px] font-semibold"
            >
              {initials(person.name)}
            </text>
            <text
              x={x}
              y={y + r + 14}
              textAnchor="middle"
              className="fill-fg text-[11px]"
            >
              {person.name.split(" ")[0]}
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
      className="flex h-1.5 overflow-hidden rounded-full bg-bg"
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

  const modeLabel =
    mode === "current"
      ? `last ${CURRENT_WINDOW_DAYS[currentWindow]} days`
      : "all time";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={mode === "current"} onClick={() => setMode("current")}>
          Closest now
        </Pill>
        <Pill active={mode === "allTime"} onClick={() => setMode("allTime")}>
          Closest overall
        </Pill>
        {mode === "current" && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <Pill
              active={currentWindow === "30d"}
              onClick={() => setCurrentWindow("30d")}
            >
              30 days
            </Pill>
            <Pill
              active={currentWindow === "90d"}
              onClick={() => setCurrentWindow("90d")}
            >
              90 days
            </Pill>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-fg-muted">
        {(
          [
            ["comms", "Synced comms"],
            ["attended", "Attended events"],
            ["upcoming", "Upcoming events"],
            ["notes", "Context notes"],
            ["commitments", "Commitments"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: SIGNAL_COLORS[key] }}
            />
            {label}
          </div>
        ))}
      </div>

      {rankings.contacts.length === 0 ? (
        <p className="text-[13px] text-fg-muted">
          No closeness signals in this period yet — synced comms, shared
          calendar events, context notes, or commitments will populate your
          inner circle.
        </p>
      ) : (
        <>
          <InnerCircleSvg contacts={rankings.contacts} />
          <p className="text-center text-[12px] text-fg-subtle">
            Ring position and dot size reflect relative closeness ({modeLabel}).
          </p>
          <ol className="space-y-2">
            {rankings.contacts.map((person, i) => (
              <li
                key={person.contactId}
                className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2"
              >
                <Mono className="w-5 shrink-0 text-[13px] text-fg-subtle">
                  {i + 1}
                </Mono>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/relationships/${person.relationshipId}`}
                    className="truncate text-[14px] font-medium text-fg hover:underline"
                  >
                    {person.name}
                  </Link>
                  <div className="mt-1.5">
                    <SignalBar person={person} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Mono className="text-[15px]">{person.score}</Mono>
                  <div className="text-[11px] text-fg-subtle">
                    {person.relativeCloseness}%
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
