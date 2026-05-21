"use client";

import { useMemo, useState } from "react";
import type {
  CalendarAnalytics,
  CalendarEvent,
  Interaction,
} from "@related/shared";
import {
  AnalyticTile,
  Badge,
  AnalyticsRow,
  DataGrid,
  Display,
  EmptyState,
  Eyebrow,
  Mono,
  Pill,
} from "@/components/ui";
import type { DataGridColumn } from "@/components/ui";

/**
 * A unified row in the calendar grid: either an Interaction (User-curated
 * relationship state) or an external CalendarEvent (observed Google
 * Calendar event). The discriminator drives badge tone and edit
 * affordances (interactions are editable elsewhere; external is read-only).
 */
type CalendarRow =
  | {
      kind: "interaction";
      id: string;
      time: string;
      title: string;
      subtitle: string | null;
      status: Interaction["status"];
    }
  | {
      kind: "external";
      id: string;
      time: string;
      title: string;
      subtitle: string | null;
      source: CalendarEvent["source"];
    };

type Filter = "all" | "interactions" | "external";

interface Props {
  interactions: Interaction[];
  externalEvents: CalendarEvent[];
  analytics: CalendarAnalytics;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarView({
  interactions,
  externalEvents,
  analytics,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const allRows: CalendarRow[] = useMemo(() => {
    const fromInteractions: CalendarRow[] = interactions.map((i) => ({
      kind: "interaction" as const,
      id: i.id,
      time: i.time,
      title: i.kind,
      subtitle:
        i.contacts.length > 0
          ? i.contacts.map((c) => c.name).join(", ")
          : i.notes,
      status: i.status,
    }));
    const fromExternal: CalendarRow[] = externalEvents.map((e) => ({
      kind: "external" as const,
      id: e.id,
      time: e.start,
      title: e.title ?? "(untitled)",
      subtitle: e.isAllDay ? "All day" : null,
      source: e.source,
    }));
    return [...fromInteractions, ...fromExternal].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }, [interactions, externalEvents]);

  const rows = allRows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "interactions") return r.kind === "interaction";
    return r.kind === "external";
  });

  const columns: DataGridColumn<CalendarRow>[] = [
    {
      key: "time",
      header: "When",
      width: "180px",
      mono: true,
      cell: (r) => fmtDateTime(r.time),
    },
    {
      key: "source",
      header: "Source",
      width: "140px",
      cell: (r) =>
        r.kind === "interaction" ? (
          <Badge tone="approved">Interaction</Badge>
        ) : (
          <Badge tone="info">{r.source === "google" ? "Google" : r.source}</Badge>
        ),
    },
    {
      key: "title",
      header: "Title",
      width: "minmax(220px, 2fr)",
      cell: (r) => <span className="truncate text-fg">{r.title}</span>,
    },
    {
      key: "subtitle",
      header: "Detail",
      width: "minmax(160px, 1fr)",
      cell: (r) => (
        <span className="truncate text-fg-muted">{r.subtitle ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      cell: (r) =>
        r.kind === "interaction" ? (
          <Badge
            tone={
              r.status === "occurred"
                ? "approved"
                : r.status === "planned"
                  ? "sent"
                  : "lost"
            }
          >
            {r.status}
          </Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Schedule</Eyebrow>
        <Display className="mt-1">Calendar</Display>
      </header>

      <AnalyticsRow>
        <AnalyticTile
          label="Total entries"
          value={<Mono>{analytics.totalEntries}</Mono>}
        />
        <AnalyticTile
          label="Planned"
          value={<Mono>{analytics.interactionCounts.planned}</Mono>}
        />
        <AnalyticTile
          label="Occurred"
          value={<Mono>{analytics.interactionCounts.occurred}</Mono>}
        />
        <AnalyticTile
          label="External (Google)"
          value={<Mono>{analytics.externalCountsBySource.google ?? 0}</Mono>}
        />
        <AnalyticTile
          label="Days w/ entries"
          value={<Mono>{analytics.daysWithEntries}</Mono>}
        />
      </AnalyticsRow>

      <div className="flex items-center gap-2">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Pill>
        <Pill
          active={filter === "interactions"}
          onClick={() => setFilter("interactions")}
        >
          Interactions
        </Pill>
        <Pill
          active={filter === "external"}
          onClick={() => setFilter("external")}
        >
          External
        </Pill>
      </div>

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.kind}:${r.id}`}
        emptyState={
          <EmptyState
            title="Nothing in the window"
            description="The calendar shows the last 30 days and the next 30. Connect Google Calendar in Setup to ingest external events."
          />
        }
      />
    </div>
  );
}
