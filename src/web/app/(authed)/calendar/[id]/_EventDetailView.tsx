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
  DateTimePropertyRow,
  Micro,
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
  { value: "attended", label: "Attended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "missed", label: "Missed" },
];

function sourceBadgeTone(source: Event["source"]): BadgeTone {
  if (source === "google") return "info";
  if (source === "outlook") return "sent";
  return "approved";
}

function sourceBadgeLabel(source: Event["source"]): string {
  if (source === "google") return "Google";
  if (source === "outlook") return "Outlook";
  return "Manual";
}

const STATUS_TONE: Record<EventStatus, BadgeTone> = {
  planned: "sent",
  occurred: "approved",
  attended: "approved",
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
  async function saveStart(iso: string) {
    await patch({ start: iso });
  }
  async function saveEnd(iso: string) {
    await patch({ end: iso });
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
    <div className="space-y-1">
      <header className="flex items-center justify-between gap-2 pb-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[event.status]}>{event.status}</Badge>
          <Badge tone={sourceBadgeTone(event.source)}>
            {sourceBadgeLabel(event.source)}
          </Badge>
        </div>
        <Button
          variant="danger"
          size="sm"
          leading={<Trash2 size={12} />}
          onClick={deleteEvent}
          loading={deleting}
        >
          Delete
        </Button>
      </header>

      {(event.source === "google" || event.source === "outlook") && (
        <Micro className="block pb-1">
          {event.source === "google" ? "Google" : "Outlook"} sync may overwrite
          title, times, location, and attendees. Aim, prep, status, and type
          are preserved.
        </Micro>
      )}

      <Section title="Details" fixed className="py-3 [&_header]:mb-2">
        <PropertyRow
          label="Title"
          value={event.title ?? ""}
          placeholder="Add a title"
          onSave={saveTitle}
          className="py-1"
        />
        <DateTimePropertyRow
          label="Start"
          iso={event.start}
          isAllDay={event.isAllDay}
          onSave={saveStart}
          className="py-1"
        />
        <DateTimePropertyRow
          label="End"
          iso={event.end}
          isAllDay={event.isAllDay}
          onSave={saveEnd}
          className="py-1"
        />
        <PropertyRow
          label="All-day"
          className="py-1"
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
          className="py-1"
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
          className="py-1"
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
          className="py-1"
        />
        <PropertyRow
          label="What for"
          value={event.aim ?? ""}
          placeholder="Why this event exists — the outcome you want"
          onSave={saveAim}
          className="py-1"
        />
        <PropertyRow
          label="Required prep"
          value={event.requiredPrep ?? ""}
          placeholder="What to do before this happens"
          onSave={savePrep}
          className="py-1"
        />
        <PropertyRow
          label="Attendees"
          className="py-1"
          value={
            event.attendees.length === 0 ? (
              <span className="text-fg-subtle italic">No attendees yet</span>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {event.attendees.map((a) => (
                  <li
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-md border border-divider bg-surface px-1.5 py-0.5 text-[13px]"
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
            )
          }
        />

        <div className="mt-1 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            leading={<Plus size={12} />}
            onClick={() => setShowAttendeePicker((v) => !v)}
          >
            Add attendee
          </Button>
        </div>

        {showAttendeePicker && (
          <div className="mt-1 rounded-md border border-divider p-2">
            <input
              autoFocus
              type="text"
              value={attendeeSearch}
              onChange={(e) => setAttendeeSearch(e.target.value)}
              placeholder="Search contacts"
              className="mb-1.5 h-8 w-full rounded border border-border bg-bg px-2 text-[14px] text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none"
            />
            {availableContacts.length === 0 ? (
              <p className="px-2 py-0.5 text-[13px] italic text-fg-subtle">
                No matching contacts.
              </p>
            ) : (
              <ul className="max-h-48 overflow-auto">
                {availableContacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => addAttendee(c.id)}
                      className="block w-full rounded px-2 py-0.5 text-left text-[14px] hover:bg-hover"
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
    </div>
  );
}
