"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  Event,
  EventStatus,
  EventType,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Badge,
  Button,
  Eyebrow,
  H1,
  PropertyRow,
  Section,
  Select,
} from "@/components/ui";
import type { BadgeTone } from "@/components/ui";

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "meeting", label: "Meeting" },
  { value: "uni", label: "Uni" },
  { value: "personal", label: "Personal" },
  { value: "activity", label: "Activity" },
];

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "occurred", label: "Occurred" },
  { value: "cancelled", label: "Cancelled" },
  { value: "missed", label: "Missed" },
];

const STATUS_TONE: Record<EventStatus, BadgeTone> = {
  planned: "sent",
  occurred: "approved",
  cancelled: "lost",
  missed: "warning",
};

interface ContactOption {
  id: string;
  name: string;
}

interface Props {
  event: Event;
  allContacts: ContactOption[];
}

/**
 * Convert an ISO timestamp to the value form a <input type="datetime-local">
 * expects (YYYY-MM-DDTHH:mm, in the browser's local timezone). Round-trips
 * via Date so the stored ISO can be in any timezone.
 */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // new Date('YYYY-MM-DDTHH:mm') is interpreted as local time.
  return new Date(local).toISOString();
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventDetailView({ event: initial, allContacts }: Props) {
  const router = useRouter();
  const deps = getBrowserDeps();
  const [event, setEvent] = useState<Event>(initial);
  const [showAttendeePicker, setShowAttendeePicker] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function patch(input: Parameters<typeof deps.events.updateEvent>[1]) {
    const updated = await deps.events.updateEvent(event.id, input);
    setEvent(updated);
  }

  async function saveTitle(next: string) {
    await patch({ title: next.trim() === "" ? null : next.trim() });
  }
  async function saveLocation(next: string) {
    await patch({ location: next.trim() === "" ? null : next.trim() });
  }
  async function saveAim(next: string) {
    await patch({ aim: next.trim() === "" ? null : next.trim() });
  }
  async function savePrep(next: string) {
    await patch({ requiredPrep: next.trim() === "" ? null : next.trim() });
  }
  async function saveStart(next: string) {
    if (!next) return;
    await patch({ start: localInputToIso(next) });
  }
  async function saveEnd(next: string) {
    if (!next) return;
    await patch({ end: localInputToIso(next) });
  }

  async function saveType(next: EventType) {
    await patch({ type: next });
  }
  async function saveStatus(next: EventStatus) {
    await patch({ status: next });
  }
  async function toggleAllDay() {
    await patch({ isAllDay: !event.isAllDay });
  }

  async function addAttendee(contactId: string) {
    const nextIds = [...event.attendees.map((a) => a.id), contactId];
    await deps.events.setAttendees(event.id, nextIds);
    const next = allContacts.find((c) => c.id === contactId);
    if (next) {
      setEvent((e) => ({
        ...e,
        attendees: [...e.attendees, { id: next.id, name: next.name }],
      }));
    }
    setAttendeeSearch("");
    setShowAttendeePicker(false);
  }

  async function removeAttendee(contactId: string) {
    const nextIds = event.attendees
      .map((a) => a.id)
      .filter((id) => id !== contactId);
    await deps.events.setAttendees(event.id, nextIds);
    setEvent((e) => ({
      ...e,
      attendees: e.attendees.filter((a) => a.id !== contactId),
    }));
  }

  async function deleteEvent() {
    if (!confirm("Delete this event?")) return;
    setDeleting(true);
    try {
      await deps.events.deleteEvent(event.id);
      router.push("/calendar");
    } catch (err) {
      setDeleting(false);
      alert(`Failed to delete: ${err instanceof Error ? err.message : err}`);
    }
  }

  const attendeeIds = new Set(event.attendees.map((a) => a.id));
  const availableContacts = allContacts
    .filter((c) => !attendeeIds.has(c.id))
    .filter((c) =>
      attendeeSearch === ""
        ? true
        : c.name.toLowerCase().includes(attendeeSearch.toLowerCase()),
    )
    .slice(0, 8);

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Event</Eyebrow>
        <H1 className="mt-1">{event.title ?? "(untitled event)"}</H1>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={STATUS_TONE[event.status]}>{event.status}</Badge>
          <Badge tone={event.source === "google" ? "info" : "approved"}>
            {event.source === "google" ? "Google" : "Manual"}
          </Badge>
          <span className="text-[13px] text-fg-muted">
            {fmtDateTime(event.start)} → {fmtDateTime(event.end)}
          </span>
        </div>
        {event.source === "google" && (
          <p className="mt-2 text-[12px] text-fg-subtle">
            Synced from Google. Title, start, end, location, and attendees may
            be overwritten on the next sync. Aim, prep, status, and type are
            yours to edit and are preserved.
          </p>
        )}
      </header>

      <Section title="Details" fixed>
        <PropertyRow
          label="Title"
          value={event.title ?? ""}
          placeholder="Add a title"
          onSave={saveTitle}
        />
        <PropertyRow
          label="Start"
          value={fmtDateTime(event.start)}
          editValue={isoToLocalInput(event.start)}
          onSave={saveStart}
        />
        <PropertyRow
          label="End"
          value={fmtDateTime(event.end)}
          editValue={isoToLocalInput(event.end)}
          onSave={saveEnd}
        />
        <PropertyRow
          label="All-day"
          value={
            <button
              type="button"
              onClick={toggleAllDay}
              className="rounded px-1.5 py-0.5 text-[13px] hover:bg-hover"
            >
              {event.isAllDay ? "Yes" : "No"}
            </button>
          }
        />
        <PropertyRow
          label="Type"
          value={
            <Select
              value={event.type}
              onChange={(e) => saveType(e.target.value as EventType)}
              className="max-w-[200px]"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
        <PropertyRow
          label="Status"
          value={
            <Select
              value={event.status}
              onChange={(e) => saveStatus(e.target.value as EventStatus)}
              className="max-w-[200px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
        <PropertyRow
          label="Location"
          value={event.location ?? ""}
          placeholder="Add a location"
          onSave={saveLocation}
        />
        <PropertyRow
          label="Source"
          value={event.source === "google" ? "Google Calendar" : "Manually created"}
        />
      </Section>

      <Section title="Aim" fixed>
        <PropertyRow
          label="What for"
          value={event.aim ?? ""}
          placeholder="Why this event exists — the outcome you want"
          onSave={saveAim}
        />
        <PropertyRow
          label="Required prep"
          value={event.requiredPrep ?? ""}
          placeholder="What to do before this happens"
          onSave={savePrep}
        />
      </Section>

      <Section
        title="Attendees"
        meta={`${event.attendees.length}`}
        fixed
        actions={
          <Button
            variant="secondary"
            size="sm"
            leading={<Plus size={12} />}
            onClick={() => setShowAttendeePicker((v) => !v)}
          >
            Add
          </Button>
        }
      >
        {event.attendees.length === 0 ? (
          <p className="py-2 text-[14px] italic text-fg-subtle">
            No attendees yet.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 py-2">
            {event.attendees.map((a) => (
              <li
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface px-2 py-1 text-[13px]"
              >
                <span>{a.name || "(unnamed)"}</span>
                <button
                  type="button"
                  onClick={() => removeAttendee(a.id)}
                  className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
                  aria-label={`Remove ${a.name}`}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {showAttendeePicker && (
          <div className="mt-2 rounded-md border border-divider p-2">
            <input
              autoFocus
              type="text"
              value={attendeeSearch}
              onChange={(e) => setAttendeeSearch(e.target.value)}
              placeholder="Search contacts"
              className="mb-2 h-8 w-full rounded border border-border bg-bg px-2 text-[14px] text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none"
            />
            {availableContacts.length === 0 ? (
              <p className="px-2 py-1 text-[13px] italic text-fg-subtle">
                No matching contacts.
              </p>
            ) : (
              <ul className="max-h-60 overflow-auto">
                {availableContacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => addAttendee(c.id)}
                      className="block w-full rounded px-2 py-1 text-left text-[14px] hover:bg-hover"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section title="Danger zone" fixed>
        <div className="py-2">
          <Button
            variant="danger"
            size="sm"
            leading={<Trash2 size={12} />}
            onClick={deleteEvent}
            loading={deleting}
          >
            Delete event
          </Button>
        </div>
      </Section>
    </div>
  );
}
