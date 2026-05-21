"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Interaction, OpenThread } from "@related/shared";
import { Card, Eyebrow, H2, Pill } from "@/components/ui";

type Window = "30d" | "12w" | "6m" | "all";

type SeriesKey = "past" | "upcoming" | "commitments" | "context";

interface Props {
  interactions: Interaction[];
  openThreads: OpenThread[];
  now?: Date;
}

interface Bucket {
  /** UTC ISO date for the start of the bucket. */
  start: string;
  /** Short axis label for this bucket. */
  label: string;
  past: number;
  upcoming: number;
  commitments: number;
  note: number;
  comms: number;
}

interface SeriesVisibility {
  past: boolean;
  upcoming: boolean;
  commitments: boolean;
  context: boolean;
}

interface ContextVisibility {
  note: boolean;
  comms: boolean;
}

const COMMS_KINDS = new Set([
  "email",
  "sms",
  "phone_call",
  "whatsapp",
  "instagram_dm",
  "x_dm",
]);

const DEFAULT_SERIES: SeriesVisibility = {
  past: true,
  upcoming: true,
  commitments: true,
  context: true,
};

const DEFAULT_CONTEXT: ContextVisibility = {
  note: true,
  comms: true,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const COLOR_PAST = "var(--color-accent)";
const COLOR_UPCOMING = "var(--color-accent-subtle)";
const COLOR_COMMITMENT = "var(--color-warning)";
const COLOR_NOTE = "var(--color-success)";
const COLOR_COMMS = "var(--color-status-sent)";

function utcStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function utcStartOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function utcStartOfWeek(d: Date): Date {
  const x = utcStartOfDay(d);
  const dow = x.getUTCDay();
  const back = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - back);
  return x;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short" });
}

function isNoteKind(kind: string): boolean {
  return kind === "note";
}

function isCommsKind(kind: string): boolean {
  return COMMS_KINDS.has(kind);
}

function isContextKind(kind: string): boolean {
  return isNoteKind(kind) || isCommsKind(kind);
}

function earliestDataDay(
  interactions: Interaction[],
  openThreads: OpenThread[],
  today: Date,
): Date {
  let earliest = today;
  for (const i of interactions) {
    const t = utcStartOfDay(new Date(i.time));
    if (t.getTime() < earliest.getTime()) earliest = t;
  }
  for (const t of openThreads) {
    const d = utcStartOfDay(new Date(t.createdAt));
    if (d.getTime() < earliest.getTime()) earliest = d;
  }
  return earliest;
}

function buildBuckets(
  window: Window,
  now: Date,
  interactions: Interaction[],
  openThreads: OpenThread[],
): Bucket[] {
  const today = utcStartOfDay(now);
  const buckets: Bucket[] = [];
  let nextAfterLast = 0;

  const emptyBucket = (start: Date, label: string): Bucket => ({
    start: start.toISOString(),
    label,
    past: 0,
    upcoming: 0,
    commitments: 0,
    note: 0,
    comms: 0,
  });

  if (window === "30d") {
    const days = 30;
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);
    for (let i = 0; i < days; i++) {
      const s = new Date(start.getTime() + i * DAY_MS);
      buckets.push(emptyBucket(s, fmtDay(s)));
    }
    nextAfterLast = today.getTime() + DAY_MS;
  } else if (window === "12w" || window === "6m") {
    const weeks = window === "12w" ? 12 : 26;
    const start = utcStartOfWeek(
      new Date(today.getTime() - (weeks - 1) * 7 * DAY_MS),
    );
    for (let i = 0; i < weeks; i++) {
      const s = new Date(start);
      s.setUTCDate(s.getUTCDate() + i * 7);
      buckets.push(emptyBucket(s, fmtDay(s)));
    }
    nextAfterLast =
      new Date(buckets[buckets.length - 1].start).getTime() + 7 * DAY_MS;
  } else if (window === "all") {
    const earliest = earliestDataDay(interactions, openThreads, today);
    const start = utcStartOfMonth(earliest);
    const end = utcStartOfMonth(today);
    let cursor = start;
    while (cursor.getTime() <= end.getTime()) {
      buckets.push(emptyBucket(cursor, fmtMonth(cursor)));
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    }
    if (buckets.length === 0) {
      buckets.push(emptyBucket(end, fmtMonth(end)));
    }
    nextAfterLast = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() + 1,
      1,
    );
  }

  const bucketStartMs = buckets.map((b) => new Date(b.start).getTime());

  const placeIndex = (iso: string): number => {
    const t = new Date(iso).getTime();
    if (t < bucketStartMs[0] || t >= nextAfterLast) return -1;
    let lo = 0;
    let hi = bucketStartMs.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (bucketStartMs[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  for (const i of interactions) {
    const idx = placeIndex(i.time);
    if (idx < 0) continue;

    if (isNoteKind(i.kind)) {
      buckets[idx].note += 1;
    } else if (isCommsKind(i.kind)) {
      buckets[idx].comms += 1;
    } else if (i.status === "occurred" || i.status === "attended") {
      buckets[idx].past += 1;
    } else if (i.status === "planned") {
      buckets[idx].upcoming += 1;
    }
  }

  for (const t of openThreads) {
    const idx = placeIndex(t.createdAt);
    if (idx < 0) continue;
    buckets[idx].commitments += 1;
  }

  return buckets;
}

function bucketTotal(
  b: Bucket,
  series: SeriesVisibility,
  context: ContextVisibility,
): number {
  let total = 0;
  if (series.past) total += b.past;
  if (series.upcoming) total += b.upcoming;
  if (series.commitments) total += b.commitments;
  if (series.context) {
    if (context.note) total += b.note;
    if (context.comms) total += b.comms;
  }
  return total;
}

function windowLabel(window: Window): string {
  switch (window) {
    case "30d":
      return "past 30 days";
    case "12w":
      return "past 12 weeks";
    case "6m":
      return "past 6 months";
    case "all":
      return "all time";
  }
}

function toggleSeries(
  current: SeriesVisibility,
  key: SeriesKey,
): SeriesVisibility {
  return { ...current, [key]: !current[key] };
}

function toggleContext(
  current: ContextVisibility,
  key: keyof ContextVisibility,
): ContextVisibility {
  return { ...current, [key]: !current[key] };
}

/**
 * Per-relationship activity chart. Hand-rolled SVG (no charting dep),
 * mirrors the Calendar bar chart. Each bucket is a vertical stacked bar of
 * past interactions, upcoming interactions, commitments opened, and context
 * added (notes and comms). Series and time window are toggled via pills.
 */
export function TouchpointsChart({
  interactions,
  openThreads,
  now,
}: Props) {
  const [window, setWindow] = useState<Window>("30d");
  const [series, setSeries] = useState<SeriesVisibility>(DEFAULT_SERIES);
  const [context, setContext] = useState<ContextVisibility>(DEFAULT_CONTEXT);
  const ref = now ?? new Date();

  const buckets = useMemo(
    () => buildBuckets(window, ref, interactions, openThreads),
    [window, ref, interactions, openThreads],
  );

  const totals = buckets.map((b) => bucketTotal(b, series, context));
  const max = Math.max(1, ...totals);
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
  const PAD_L = 48;
  const PAD_R = 48;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const n = buckets.length;
  const slot = innerW / Math.max(n, 1);
  const barW = Math.max(4, Math.min(36, slot * 0.62));

  const yAt = (count: number) =>
    PAD_T + innerH - (count / niceMax) * innerH;
  const slotCenterX = (i: number) => PAD_L + slot * i + slot / 2;

  const xLabelEvery = Math.max(1, Math.floor(n / 6));

  const totalPast = buckets.reduce((s, b) => s + b.past, 0);
  const totalUpcoming = buckets.reduce((s, b) => s + b.upcoming, 0);
  const totalCommit = buckets.reduce((s, b) => s + b.commitments, 0);
  const totalNote = buckets.reduce((s, b) => s + b.note, 0);
  const totalComms = buckets.reduce((s, b) => s + b.comms, 0);
  const hasAny = totals.some((t) => t > 0);

  const segments: Array<{
    key: string;
    value: number;
    color: string;
    stroke?: string;
    label: string;
  }> = [];
  if (series.past) {
    segments.push({
      key: "past",
      value: totalPast,
      color: COLOR_PAST,
      label: `Past interactions (${totalPast})`,
    });
  }
  if (series.upcoming) {
    segments.push({
      key: "upcoming",
      value: totalUpcoming,
      color: COLOR_UPCOMING,
      stroke: COLOR_PAST,
      label: `Upcoming (${totalUpcoming})`,
    });
  }
  if (series.commitments) {
    segments.push({
      key: "commitments",
      value: totalCommit,
      color: COLOR_COMMITMENT,
      label: `Commitments (${totalCommit})`,
    });
  }
  if (series.context && context.note) {
    segments.push({
      key: "note",
      value: totalNote,
      color: COLOR_NOTE,
      label: `Notes (${totalNote})`,
    });
  }
  if (series.context && context.comms) {
    segments.push({
      key: "comms",
      value: totalComms,
      color: COLOR_COMMS,
      label: `Comms (${totalComms})`,
    });
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Touchpoints</Eyebrow>
          <H2 className="mt-1">Activity</H2>
          <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
            Interactions, commitments, and context across the {windowLabel(window)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Pill active={window === "30d"} onClick={() => setWindow("30d")}>
            30 days
          </Pill>
          <Pill active={window === "12w"} onClick={() => setWindow("12w")}>
            12 weeks
          </Pill>
          <Pill active={window === "6m"} onClick={() => setWindow("6m")}>
            6 months
          </Pill>
          <Pill active={window === "all"} onClick={() => setWindow("all")}>
            All time
          </Pill>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
          Show:
        </span>
        <Pill
          active={series.past}
          onClick={() => setSeries((s) => toggleSeries(s, "past"))}
        >
          Past interactions
        </Pill>
        <Pill
          active={series.upcoming}
          onClick={() => setSeries((s) => toggleSeries(s, "upcoming"))}
        >
          Upcoming
        </Pill>
        <Pill
          active={series.commitments}
          onClick={() => setSeries((s) => toggleSeries(s, "commitments"))}
        >
          Commitments
        </Pill>
        <Pill
          active={series.context}
          onClick={() => setSeries((s) => toggleSeries(s, "context"))}
        >
          Context
        </Pill>
      </div>

      {series.context ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
            Context:
          </span>
          <Pill
            active={context.note}
            onClick={() => setContext((c) => toggleContext(c, "note"))}
          >
            Notes
          </Pill>
          <Pill
            active={context.comms}
            onClick={() => setContext((c) => toggleContext(c, "comms"))}
          >
            Comms
          </Pill>
        </div>
      ) : null}

      <div className="mt-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Relationship activity over time"
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
                x={PAD_L - 10}
                y={yAt(t) + 4}
                textAnchor="end"
                className="fill-fg-muted font-[family-name:var(--font-jetbrains-mono)] text-[12px]"
              >
                {t}
              </text>
            </g>
          ))}

          {buckets.map((b, i) => {
            const cx = slotCenterX(i);
            const x = cx - barW / 2;
            const yBase = PAD_T + innerH;
            let stackTop = 0;

            const pushSegment = (
              segmentKey: string,
              count: number,
              color: string,
              stroke: string | undefined,
              title: string,
            ) => {
              if (count <= 0) return;
              const h = (count / niceMax) * innerH;
              const y = yBase - stackTop - h;
              stackTop += h;
              return (
                <rect
                  key={`${i}-${segmentKey}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={color}
                  stroke={stroke}
                  strokeWidth={stroke ? 1 : 0}
                  rx={2}
                >
                  <title>{`${b.label}: ${title}`}</title>
                </rect>
              );
            };

            const parts: ReactNode[] = [];
            if (series.past) {
              const seg = pushSegment(
                "past",
                b.past,
                COLOR_PAST,
                undefined,
                `${b.past} past interaction${b.past === 1 ? "" : "s"}`,
              );
              if (seg) parts.push(seg);
            }
            if (series.upcoming) {
              const seg = pushSegment(
                "upcoming",
                b.upcoming,
                COLOR_UPCOMING,
                COLOR_PAST,
                `${b.upcoming} upcoming interaction${b.upcoming === 1 ? "" : "s"}`,
              );
              if (seg) parts.push(seg);
            }
            if (series.commitments) {
              const seg = pushSegment(
                "commitments",
                b.commitments,
                COLOR_COMMITMENT,
                undefined,
                `${b.commitments} commitment${b.commitments === 1 ? "" : "s"} opened`,
              );
              if (seg) parts.push(seg);
            }
            if (series.context && context.note) {
              const seg = pushSegment(
                "note",
                b.note,
                COLOR_NOTE,
                undefined,
                `${b.note} note${b.note === 1 ? "" : "s"}`,
              );
              if (seg) parts.push(seg);
            }
            if (series.context && context.comms) {
              const seg = pushSegment(
                "comms",
                b.comms,
                COLOR_COMMS,
                undefined,
                `${b.comms} comm${b.comms === 1 ? "" : "s"}`,
              );
              if (seg) parts.push(seg);
            }

            return <g key={`b-${i}`}>{parts}</g>;
          })}

          {buckets.map((b, i) =>
            i % xLabelEvery === 0 ? (
              <text
                key={`x-${i}`}
                x={slotCenterX(i)}
                y={H - PAD_B + 18}
                textAnchor="middle"
                className="fill-fg-muted text-[12px]"
              >
                {b.label}
              </text>
            ) : null,
          )}
        </svg>

        {!hasAny && (
          <p className="mt-3 text-center text-[13px] text-fg-muted">
            No activity in this window yet.
          </p>
        )}

        {segments.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
            {segments.map((seg) => (
              <LegendSwatch
                key={seg.key}
                color={seg.color}
                stroke={seg.stroke}
                label={seg.label}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function LegendSwatch({
  color,
  stroke,
  label,
}: {
  color: string;
  stroke?: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{
          background: color,
          boxShadow: stroke ? `inset 0 0 0 1px ${stroke}` : undefined,
        }}
      />
      {label}
    </span>
  );
}
