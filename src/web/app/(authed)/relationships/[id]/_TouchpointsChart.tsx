"use client";

import { useMemo, useState } from "react";
import type { Interaction, OpenThread } from "@related/shared";
import { Card, Eyebrow, H2, Pill } from "@/components/ui";

type Window = "12w" | "6m" | "12m";

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
  occurred: number;
  planned: number;
  commitments: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
  // ISO week starts on Monday. getUTCDay: 0=Sun..6=Sat
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

function buildBuckets(
  window: Window,
  now: Date,
  interactions: Interaction[],
  openThreads: OpenThread[],
): Bucket[] {
  const today = utcStartOfDay(now);
  const buckets: Bucket[] = [];

  if (window === "12w" || window === "6m") {
    const weeks = window === "12w" ? 12 : 26;
    const start = utcStartOfWeek(new Date(today.getTime() - (weeks - 1) * 7 * DAY_MS));
    for (let i = 0; i < weeks; i++) {
      const s = new Date(start);
      s.setUTCDate(s.getUTCDate() + i * 7);
      buckets.push({
        start: s.toISOString(),
        label: fmtDay(s),
        occurred: 0,
        planned: 0,
        commitments: 0,
      });
    }
  } else {
    const months = 12;
    const start = utcStartOfMonth(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1), 1)),
    );
    for (let i = 0; i < months; i++) {
      const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      buckets.push({
        start: s.toISOString(),
        label: fmtMonth(s),
        occurred: 0,
        planned: 0,
        commitments: 0,
      });
    }
  }

  const bucketStartMs = buckets.map((b) => new Date(b.start).getTime());
  // Treat the cap as the end of the last bucket; everything beyond falls out.
  const lastIdx = buckets.length - 1;
  const nextAfterLast =
    window === "12m"
      ? Date.UTC(
          new Date(buckets[lastIdx].start).getUTCFullYear(),
          new Date(buckets[lastIdx].start).getUTCMonth() + 1,
          1,
        )
      : bucketStartMs[lastIdx] + 7 * DAY_MS;

  const placeIndex = (iso: string): number => {
    const t = new Date(iso).getTime();
    if (t < bucketStartMs[0] || t >= nextAfterLast) return -1;
    // Binary search: largest bucket index with start <= t
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
    if (i.status === "occurred" || i.status === "attended") {
      buckets[idx].occurred += 1;
    } else if (i.status === "planned") {
      buckets[idx].planned += 1;
    }
  }

  for (const t of openThreads) {
    const idx = placeIndex(t.createdAt);
    if (idx < 0) continue;
    buckets[idx].commitments += 1;
  }

  return buckets;
}

const COLOR_OCCURRED = "var(--color-accent)";
const COLOR_PLANNED = "var(--color-accent-subtle)";
const COLOR_COMMITMENT = "var(--color-warning)";
const COLOR_DEPTH = "var(--color-fg-muted)";

/**
 * Per-Relationship touchpoints chart. Hand-rolled SVG (no charting dep),
 * mirrors the visual language of the Calendar growth chart. Each bucket is
 * a stacked bar — past interactions, future interactions, commitments
 * opened — and a thin overlay line tracks cumulative occurred interactions
 * across the window as a coarse "depth" signal. Window toggles via pills
 * in the header.
 */
export function TouchpointsChart({
  interactions,
  openThreads,
  now,
}: Props) {
  const [window, setWindow] = useState<Window>("12w");
  const ref = now ?? new Date();

  const buckets = useMemo(
    () => buildBuckets(window, ref, interactions, openThreads),
    [window, ref, interactions, openThreads],
  );

  const totals = buckets.map(
    (b) => b.occurred + b.planned + b.commitments,
  );
  const max = Math.max(1, ...totals);
  const niceMax =
    max <= 3 ? 3 : max <= 6 ? 6 : max <= 10 ? 10 : Math.ceil(max / 5) * 5;
  const yTicks = [
    0,
    Math.round(niceMax / 3),
    Math.round((niceMax * 2) / 3),
    niceMax,
  ];

  // Cumulative occurred interactions across the window — the "depth" line.
  const cumulative: number[] = [];
  let running = 0;
  for (const b of buckets) {
    running += b.occurred;
    cumulative.push(running);
  }
  const cumMax = Math.max(1, ...cumulative);

  const W = 1000;
  const H = 240;
  const PAD_L = 48;
  const PAD_R = 48;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const n = buckets.length;
  const slot = innerW / n;
  const barW = Math.max(4, Math.min(36, slot * 0.62));

  const yAt = (count: number) =>
    PAD_T + innerH - (count / niceMax) * innerH;
  const yAtDepth = (count: number) =>
    PAD_T + innerH - (count / cumMax) * innerH;
  const slotCenterX = (i: number) => PAD_L + slot * i + slot / 2;

  const depthPath = cumulative
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${slotCenterX(i).toFixed(1)} ${yAtDepth(v).toFixed(1)}`,
    )
    .join(" ");

  const xLabelEvery = Math.max(1, Math.floor(n / 6));

  const totalOccurred = buckets.reduce((s, b) => s + b.occurred, 0);
  const totalPlanned = buckets.reduce((s, b) => s + b.planned, 0);
  const totalCommit = buckets.reduce((s, b) => s + b.commitments, 0);
  const hasAny = totalOccurred + totalPlanned + totalCommit > 0;

  const windowLabel =
    window === "12w"
      ? "last 12 weeks"
      : window === "6m"
        ? "last 6 months"
        : "last 12 months";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Touchpoints</Eyebrow>
          <H2 className="mt-1">Frequency &amp; depth</H2>
          <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
            Interactions and commitments across the {windowLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={window === "12w"} onClick={() => setWindow("12w")}>
            12 weeks
          </Pill>
          <Pill active={window === "6m"} onClick={() => setWindow("6m")}>
            6 months
          </Pill>
          <Pill active={window === "12m"} onClick={() => setWindow("12m")}>
            12 months
          </Pill>
        </div>
      </div>

      <div className="mt-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Touchpoints over time"
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
            const hOcc = (b.occurred / niceMax) * innerH;
            const hPlanned = (b.planned / niceMax) * innerH;
            const hCom = (b.commitments / niceMax) * innerH;
            return (
              <g key={`b-${i}`}>
                {b.occurred > 0 && (
                  <rect
                    x={x}
                    y={yBase - hOcc}
                    width={barW}
                    height={hOcc}
                    fill={COLOR_OCCURRED}
                    rx={2}
                  >
                    <title>{`${b.label}: ${b.occurred} past interaction${b.occurred === 1 ? "" : "s"}`}</title>
                  </rect>
                )}
                {b.planned > 0 && (
                  <rect
                    x={x}
                    y={yBase - hOcc - hPlanned}
                    width={barW}
                    height={hPlanned}
                    fill={COLOR_PLANNED}
                    stroke={COLOR_OCCURRED}
                    strokeWidth={1}
                    rx={2}
                  >
                    <title>{`${b.label}: ${b.planned} upcoming interaction${b.planned === 1 ? "" : "s"}`}</title>
                  </rect>
                )}
                {b.commitments > 0 && (
                  <rect
                    x={x}
                    y={yBase - hOcc - hPlanned - hCom}
                    width={barW}
                    height={hCom}
                    fill={COLOR_COMMITMENT}
                    rx={2}
                  >
                    <title>{`${b.label}: ${b.commitments} commitment${b.commitments === 1 ? "" : "s"} opened`}</title>
                  </rect>
                )}
              </g>
            );
          })}

          {cumMax > 0 && hasAny && (
            <>
              <path
                d={depthPath}
                fill="none"
                stroke={COLOR_DEPTH}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x={W - PAD_R + 4}
                y={yAtDepth(cumulative[cumulative.length - 1]) + 4}
                textAnchor="start"
                className="fill-fg-muted font-[family-name:var(--font-jetbrains-mono)] text-[11px]"
              >
                {cumulative[cumulative.length - 1]}
              </text>
            </>
          )}

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
            No touchpoints in this window yet.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
          <LegendSwatch color={COLOR_OCCURRED} label={`Past interactions (${totalOccurred})`} />
          <LegendSwatch
            color={COLOR_PLANNED}
            stroke={COLOR_OCCURRED}
            label={`Upcoming (${totalPlanned})`}
          />
          <LegendSwatch color={COLOR_COMMITMENT} label={`Commitments opened (${totalCommit})`} />
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line
                x1="0"
                x2="18"
                y1="3"
                y2="3"
                stroke={COLOR_DEPTH}
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            </svg>
            Cumulative depth
          </span>
        </div>
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
