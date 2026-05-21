"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type {
  Interaction,
  OpenThread,
  Relationship,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Badge,
  EmptyState,
  Eyebrow,
  H1,
  Mono,
  Section,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { TouchpointsChart } from "./_TouchpointsChart";
import { ContextTimeline } from "./_ContextTimeline";

interface GroupSummary {
  id: string;
  name: string;
  /** The auto-paired Group-targeted Relationship id, used for routing. */
  relationshipId: string;
}

interface Props {
  relationship: Relationship;
  interactions: Interaction[];
  openThreads: OpenThread[];
  groupMemberships: GroupSummary[];
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RelationshipDetailView({
  relationship: initialRelationship,
  interactions,
  openThreads,
  groupMemberships,
}: Props) {
  const deps = getBrowserDeps();
  const [relationship, setRelationship] = useState(initialRelationship);

  async function saveContact(
    field: "name" | "phone" | "email" | "birthday" | "area" | "occupation" | "education",
    next: string,
  ) {
    const value = next.trim() === "" ? null : next.trim();
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { [field]: value },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveRelationship(field: "role" | "cadence", next: string) {
    const value = next.trim() === "" ? null : next.trim();
    const updated = await deps.relationships.updateRelationship(
      relationship.id,
      { [field]: value },
    );
    setRelationship(updated);
  }

  const upcoming = interactions
    .filter((i) => i.status === "planned")
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Relationship</Eyebrow>
        <H1 className="mt-1">{relationship.contact.name}</H1>
      </header>

      <TouchpointsChart
        interactions={interactions}
        openThreads={openThreads}
      />

      <KeyDetailsStrip
        relationship={relationship}
        groupMemberships={groupMemberships}
        onSaveContact={saveContact}
        onSaveRelationship={saveRelationship}
      />

      <Section
        title="Upcoming"
        meta={
          upcoming.length === 0
            ? "Nothing scheduled"
            : `${upcoming.length} planned`
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing on the calendar"
            description="Plan a catch-up or future Interaction to see it here."
          />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((i) => (
              <li
                key={i.id}
                className="rounded-md border border-divider p-3 text-[14px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{i.kind}</span>
                    <Badge tone="sent">planned</Badge>
                  </div>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] tabular-nums text-fg-muted">
                    {fmtDateTime(i.time)}
                  </span>
                </div>
                {i.notes && <div className="mt-1 text-fg-muted">{i.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Context timeline"
        meta={`${interactions.filter((i) => i.status !== "planned").length + openThreads.length} entries`}
      >
        <ContextTimeline
          interactions={interactions}
          openThreads={openThreads}
        />
      </Section>
    </div>
  );
}

interface KeyDetailsStripProps {
  relationship: Relationship;
  groupMemberships: GroupSummary[];
  onSaveContact: (
    field: "name" | "phone" | "email" | "birthday" | "area" | "occupation" | "education",
    next: string,
  ) => Promise<void>;
  onSaveRelationship: (field: "role" | "cadence", next: string) => Promise<void>;
}

/**
 * Dense horizontal strip of editable Relationship + Contact properties.
 * Replaces the verbose two-column PropertyRow stack — values flow left to
 * right and wrap so the strip occupies the page width but minimal vertical
 * space. Each field is click-to-edit; the Groups field is read-only and
 * routes out to the linked Group pages.
 */
function KeyDetailsStrip({
  relationship,
  groupMemberships,
  onSaveContact,
  onSaveRelationship,
}: KeyDetailsStripProps) {
  return (
    <section className="border-b border-divider py-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <CompactField
          label="Role"
          value={relationship.role ?? ""}
          placeholder="e.g. close friend"
          onSave={(v) => onSaveRelationship("role", v)}
        />
        <CompactField
          label="Cadence"
          value={relationship.cadence ?? ""}
          placeholder="e.g. every couple of weeks"
          onSave={(v) => onSaveRelationship("cadence", v)}
        />
        <CompactField
          label="Phone"
          value={relationship.contact.phone ?? ""}
          placeholder="Add a phone number"
          onSave={(v) => onSaveContact("phone", v)}
        />
        <CompactField
          label="Email"
          value={relationship.contact.email ?? ""}
          placeholder="Add an email"
          onSave={(v) => onSaveContact("email", v)}
        />
        <CompactField
          label="Birthday"
          value={relationship.contact.birthday ?? ""}
          placeholder="YYYY-MM-DD"
          mono
          onSave={(v) => onSaveContact("birthday", v)}
        />
        <CompactField
          label="Area"
          value={relationship.contact.area ?? ""}
          placeholder="e.g. Surry Hills"
          onSave={(v) => onSaveContact("area", v)}
        />
        <CompactField
          label="Occupation"
          value={relationship.contact.occupation ?? ""}
          placeholder="e.g. product designer"
          onSave={(v) => onSaveContact("occupation", v)}
        />
        <CompactField
          label="Education"
          value={relationship.contact.education ?? ""}
          placeholder="e.g. UNSW, BSc"
          onSave={(v) => onSaveContact("education", v)}
        />
        <div className="min-w-0">
          <FieldLabel>Groups</FieldLabel>
          {groupMemberships.length === 0 ? (
            <span className="text-[13px] italic text-fg-subtle">
              No groups yet
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {groupMemberships.map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`} className="inline-flex">
                  <Badge tone="info">
                    <Users size={11} className="mr-1" />
                    {g.name}
                  </Badge>
                </Link>
              ))}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
      {children}
    </div>
  );
}

interface CompactFieldProps {
  label: string;
  value: string;
  placeholder: string;
  mono?: boolean;
  onSave: (next: string) => Promise<void>;
}

/**
 * Click-to-edit single-line field for the Key Details strip. Mirrors the
 * PropertyRow edit lifecycle (focus → blur to commit, Escape to cancel)
 * but in a compact label-above-value layout.
 */
function CompactField({
  label,
  value,
  placeholder,
  mono = false,
  onSave,
}: CompactFieldProps) {
  const id = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function startEdit() {
    setDraft(value);
    setIsEditing(true);
  }

  async function commit() {
    setIsEditing(false);
    if (draft === value) return;
    await onSave(draft);
  }

  function cancel() {
    setDraft(value);
    setIsEditing(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  const isEmpty = value.length === 0;
  const displayClass = cn(
    "block w-full truncate rounded px-1 py-[2px] text-left text-[14px] leading-[20px]",
    isEmpty ? "italic text-fg-subtle" : mono ? "font-[family-name:var(--font-jetbrains-mono)] text-fg" : "text-fg",
    "cursor-text hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  );

  return (
    <div className="min-w-0">
      <FieldLabel>
        <label htmlFor={isEditing ? id : undefined}>{label}</label>
      </FieldLabel>
      {isEditing ? (
        <input
          id={id}
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className={cn(
            "w-full rounded px-1 py-[2px] text-[14px] leading-[20px] text-fg outline outline-1 outline-border-strong focus-visible:outline-accent",
            mono && "font-[family-name:var(--font-jetbrains-mono)]",
          )}
        />
      ) : (
        <button type="button" onClick={startEdit} className={displayClass}>
          {isEmpty ? placeholder : mono ? <Mono>{value}</Mono> : value}
        </button>
      )}
    </div>
  );
}
