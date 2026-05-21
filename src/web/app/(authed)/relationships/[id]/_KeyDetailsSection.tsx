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
import type { Relationship } from "@related/shared";
import { Badge, Mono } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface GroupSummary {
  id: string;
  name: string;
  relationshipId: string;
}

interface Props {
  relationship: Relationship;
  groupMemberships: GroupSummary[];
  onSaveContact: (
    field:
      | "name"
      | "phone"
      | "email"
      | "birthday"
      | "area"
      | "occupation"
      | "education",
    next: string,
  ) => Promise<void>;
  onSaveRelationship: (field: "role" | "cadence", next: string) => Promise<void>;
}

export function KeyDetailsSection({
  relationship,
  groupMemberships,
  onSaveContact,
  onSaveRelationship,
}: Props) {
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
  useEffect(() => setDraft(value), [value]);

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
    isEmpty
      ? "italic text-fg-subtle"
      : mono
        ? "font-[family-name:var(--font-jetbrains-mono)] text-fg"
        : "text-fg",
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
