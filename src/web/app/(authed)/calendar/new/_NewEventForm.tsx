"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { EventStatus, EventType } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Badge,
  Button,
  Display,
  Eyebrow,
  Input,
  Section,
  Select,
  Textarea,
} from "@/components/ui";

interface ContactOption {
  id: string;
  name: string;
}

interface Props {
  allContacts: ContactOption[];
}

function defaultStart(): string {
  // Snap to the next half-hour in local time.
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHour(local: string): string {
  const d = new Date(local);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewEventForm({ allContacts }: Props) {
  const router = useRouter();
  const deps = getBrowserDeps();

  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(addHour(defaultStart()));
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [aim, setAim] = useState("");
  const [requiredPrep, setRequiredPrep] = useState("");
  const [type, setType] = useState<EventType>("meeting");
  const [status, setStatus] = useState<EventStatus>("planned");
  const [attendees, setAttendees] = useState<ContactOption[]>([]);
  const [attendeePicker, setAttendeePicker] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attendeeIds = new Set(attendees.map((a) => a.id));
  const availableContacts = allContacts
    .filter((c) => !attendeeIds.has(c.id))
    .filter((c) =>
      attendeeSearch === ""
        ? true
        : c.name.toLowerCase().includes(attendeeSearch.toLowerCase()),
    )
    .slice(0, 8);

  async function submit() {
    if (!start || !end) {
      setError("Start and end are required.");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      setError("End must be after start.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await deps.events.createEvent({
        title: title.trim() === "" ? null : title.trim(),
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        isAllDay,
        location: location.trim() === "" ? null : location.trim(),
        aim: aim.trim() === "" ? null : aim.trim(),
        requiredPrep: requiredPrep.trim() === "" ? null : requiredPrep.trim(),
        type,
        status,
        contactIds: attendees.map((a) => a.id),
      });
      router.push(`/calendar/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>New</Eyebrow>
        <Display className="mt-1">New event</Display>
      </header>

      <Section title="Details" fixed>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the event?"
          />
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">Start</label>
          <Input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">End</label>
          <Input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">All-day</label>
          <label className="inline-flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
            />
            <span>Treat as an all-day entry</span>
          </label>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">Type</label>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            className="max-w-[260px]"
          >
            <option value="work">Work</option>
            <option value="meeting">Meeting</option>
            <option value="uni">Uni</option>
            <option value="personal">Personal</option>
            <option value="activity">Activity</option>
          </Select>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">Status</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
            className="max-w-[260px]"
          >
            <option value="planned">Planned</option>
            <option value="occurred">Occurred</option>
            <option value="cancelled">Cancelled</option>
            <option value="missed">Missed</option>
          </Select>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where is this happening?"
          />
        </div>
      </Section>

      <Section title="Aim" fixed>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">What for</label>
          <Textarea
            value={aim}
            onChange={(e) => setAim(e.target.value)}
            placeholder="Why this event exists — the outcome you want"
            rows={2}
          />
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5">
          <label className="pt-1.5 text-[13px] text-fg-muted">
            Required prep
          </label>
          <Textarea
            value={requiredPrep}
            onChange={(e) => setRequiredPrep(e.target.value)}
            placeholder="What to do before this happens"
            rows={2}
          />
        </div>
      </Section>

      <Section
        title="Attendees"
        meta={`${attendees.length}`}
        fixed
        actions={
          <Button
            variant="secondary"
            size="sm"
            leading={<Plus size={12} />}
            onClick={() => setAttendeePicker((v) => !v)}
          >
            Add
          </Button>
        }
      >
        {attendees.length === 0 ? (
          <p className="py-2 text-[14px] italic text-fg-subtle">
            No attendees yet.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 py-2">
            {attendees.map((a) => (
              <li
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface px-2 py-1 text-[13px]"
              >
                <span>{a.name || "(unnamed)"}</span>
                <button
                  type="button"
                  onClick={() =>
                    setAttendees((cur) => cur.filter((c) => c.id !== a.id))
                  }
                  className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
                  aria-label={`Remove ${a.name}`}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {attendeePicker && (
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
                      onClick={() => {
                        setAttendees((cur) => [...cur, c]);
                        setAttendeeSearch("");
                        setAttendeePicker(false);
                      }}
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

      {error && (
        <div className="py-2">
          <Badge tone="danger">{error}</Badge>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button variant="primary" onClick={submit} loading={saving}>
          Create event
        </Button>
        <Button variant="ghost" onClick={() => router.push("/calendar")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
