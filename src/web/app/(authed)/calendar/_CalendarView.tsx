"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type {
  CalendarAnalytics,
  Event,
  EventStatus,
  EventType,
} from "@related/shared";
import {
  AnalyticTile,
  AnalyticsRow,
  Badge,
  Button,
  DataGrid,
  Display,
  EmptyState,
  Eyebrow,
  Mono,
  Pill,
  Section,
} from "@/components/ui";
import type { BadgeTone, DataGridColumn } from "@/components/ui";
import { EventsBarChart } from "./_EventsBarChart";

interface Props {
  events: Event[];
  analytics: CalendarAnalytics;
}

type StatusFilter = "all" | EventStatus;
type TypeFilter = "all" | EventType;

const TYPE_LABEL: Record<EventType, string> = {
  work: "Work",
  meeting: "Meeting",
  uni: "Uni",
  personal: "Personal",
  activity: "Activity",
};

const TYPE_TONE: Record<EventType, BadgeTone> = {
  work: "info",
  meeting: "sent",
  uni: "warning",
  personal: "approved",
  activity: "lost",
};

const STATUS_TONE: Record<EventStatus, BadgeTone> = {
  planned: "sent",
  occurred: "approved",
  attended: "approved",
  cancelled: "lost",
  missed: "warning",
};

const ALL_STATUSES: EventStatus[] = [
  "planned",
  "occurred",
  "attended",
  "cancelled",
  "missed",
];

const ALL_TYPES: EventType[] = [
  "work",
  "meeting",
  "uni",
  "personal",
  "activity",
];

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtAttendees(event: Event): string {
  if (event.attendees.length === 0) return "—";
  const names = event.attendees.map((a) => a.name).filter(Boolean);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function partitionByTime(events: Event[], now: Date) {
  const t = now.getTime();
  const future: Event[] = [];
  const past: Event[] = [];
  for (const e of events) {
    if (new Date(e.end).getTime() < t) past.push(e);
    else future.push(e);
  }
  future.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  past.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  return { future, past };
}

const COLUMNS: DataGridColumn<Event>[] = [
  {
    key: "time",
    header: "When",
    width: "170px",
    mono: true,
    cell: (e) => fmtDateTime(e.start),
  },
  {
    key: "title",
    header: "Title",
    width: "minmax(200px, 2fr)",
    cell: (e) => (
      <span className="truncate text-fg">{e.title ?? "(untitled)"}</span>
    ),
  },
  {
    key: "type",
    header: "Type",
    width: "110px",
    cell: (e) => <Badge tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Badge>,
  },
  {
    key: "status",
    header: "Status",
    width: "110px",
    cell: (e) => <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>,
  },
  {
    key: "attendees",
    header: "Attendees",
    width: "minmax(140px, 1fr)",
    cell: (e) => (
      <span className="truncate text-fg-muted">{fmtAttendees(e)}</span>
    ),
  },
  {
    key: "location",
    header: "Location",
    width: "minmax(140px, 1fr)",
    cell: (e) => (
      <span className="truncate text-fg-muted">{e.location ?? "—"}</span>
    ),
  },
];

export function CalendarView({ events, analytics }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      return true;
    });
  }, [events, statusFilter, typeFilter]);

  const { future: futureRows, past: pastRows } = useMemo(
    () => partitionByTime(filtered, now),
    [filtered, now],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Schedule</Eyebrow>
          <Display className="mt-1">Calendar</Display>
        </div>
        <Link href="/calendar/new">
          <Button variant="primary" leading={<Plus size={14} />}>
            New event
          </Button>
        </Link>
      </header>

      <AnalyticsRow>
        <AnalyticTile
          label="Total"
          value={<Mono>{analytics.totalEntries}</Mono>}
        />
        <AnalyticTile
          label="Planned"
          value={<Mono>{analytics.statusCounts.planned}</Mono>}
        />
        <AnalyticTile
          label="Attended"
          value={<Mono>{analytics.statusCounts.attended}</Mono>}
        />
        <AnalyticTile
          label="Occurred"
          value={<Mono>{analytics.statusCounts.occurred}</Mono>}
        />
        <AnalyticTile
          label="Meetings"
          value={<Mono>{analytics.typeCounts.meeting}</Mono>}
        />
        <AnalyticTile
          label="Days w/ entries"
          value={<Mono>{analytics.daysWithEntries}</Mono>}
        />
      </AnalyticsRow>

      <EventsBarChart events={events} now={now} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            Status
          </span>
          <Pill
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          >
            All
          </Pill>
          {ALL_STATUSES.map((s) => (
            <Pill
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Pill>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            Type
          </span>
          <Pill
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          >
            All
          </Pill>
          {ALL_TYPES.map((t) => (
            <Pill
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            >
              {TYPE_LABEL[t]}
            </Pill>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing in the window"
          description="The calendar shows the last 30 days and the next 30. Create an event with “New event”, or connect Google Calendar in Setup."
        />
      ) : (
        <>
          <Section
            title="Upcoming"
            meta={
              futureRows.length === 1
                ? "1 event"
                : `${futureRows.length} events`
            }
            fixed
          >
            <DataGrid
              columns={COLUMNS}
              rows={futureRows}
              rowKey={(e) => e.id}
              rowHref={(e) => `/calendar/${e.id}`}
              emptyState={
                <p className="text-[13px] text-fg-muted">
                  No upcoming events match these filters.
                </p>
              }
            />
          </Section>
          <Section
            title="Past"
            meta={
              pastRows.length === 1 ? "1 event" : `${pastRows.length} events`
            }
            defaultCollapsed
          >
            <DataGrid
              columns={COLUMNS}
              rows={pastRows}
              rowKey={(e) => e.id}
              rowHref={(e) => `/calendar/${e.id}`}
              emptyState={
                <p className="text-[13px] text-fg-muted">
                  No past events match these filters.
                </p>
              }
            />
          </Section>
        </>
      )}
    </div>
  );
}
