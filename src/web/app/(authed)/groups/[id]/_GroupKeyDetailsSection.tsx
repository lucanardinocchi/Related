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
import { User } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  GroupMembersWidget,
  type GroupMemberSummary,
} from "./_GroupMembersWidget";

export interface GroupMemberMessagingFields {
  id: string;
  name: string;
  relationshipId: string | null;
  phone: string | null;
  xUsername: string | null;
  tiktokUsername: string | null;
}

interface Props {
  name: string;
  members: GroupMemberSummary[];
  memberMessaging: GroupMemberMessagingFields[];
  onSaveName: (next: string) => Promise<void>;
  onSaveMember: (
    contactId: string,
    field: "phone" | "xUsername" | "tiktokUsername",
    next: string,
  ) => Promise<void>;
}

export function GroupKeyDetailsSection({
  name,
  members,
  memberMessaging,
  onSaveName,
  onSaveMember,
}: Props) {
  return (
    <section className="border-b border-divider py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <GroupMembersWidget members={members} />

        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
            <CompactField
              label="Name"
              value={name}
              placeholder="Group name"
              onSave={onSaveName}
            />
            <div className="min-w-0 sm:col-span-2">
              <FieldLabel>Members</FieldLabel>
              {members.length === 0 ? (
                <span className="text-[13px] italic text-fg-subtle">
                  No members yet
                </span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {members.map((m) =>
                    m.relationshipId ? (
                      <Link
                        key={m.id}
                        href={`/relationships/${m.relationshipId}`}
                        className="inline-flex"
                      >
                        <Badge tone="neutral">
                          <User size={11} className="mr-1" />
                          {m.name}
                        </Badge>
                      </Link>
                    ) : (
                      <Badge key={m.id} tone="neutral">
                        <User size={11} className="mr-1" />
                        {m.name}
                      </Badge>
                    ),
                  )}
                </span>
              )}
            </div>
          </div>

          {memberMessaging.length > 0 ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Member contact details</FieldLabel>
                <p className="mt-0.5 text-[12px] text-fg-muted">
                  Phone and handles for each person — used for group iMessage,
                  WhatsApp, X, and TikTok below.
                </p>
              </div>
              <ul className="space-y-3">
                {memberMessaging.map((member) => (
                  <li
                    key={member.id}
                    className="rounded-md border border-border bg-surface px-3 py-2.5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {member.relationshipId ? (
                        <Link
                          href={`/relationships/${member.relationshipId}`}
                          className="text-[13px] font-medium text-fg hover:underline"
                        >
                          {member.name}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-medium text-fg">
                          {member.name}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
                      <CompactField
                        label="Phone"
                        value={member.phone ?? ""}
                        placeholder="e.g. +61 412 345 678"
                        onSave={(v) => onSaveMember(member.id, "phone", v)}
                      />
                      <CompactField
                        label="X handle"
                        value={member.xUsername ?? ""}
                        placeholder="username (without @)"
                        onSave={(v) =>
                          onSaveMember(member.id, "xUsername", v)
                        }
                      />
                      <CompactField
                        label="TikTok handle"
                        value={member.tiktokUsername ?? ""}
                        placeholder="username (without @)"
                        onSave={(v) =>
                          onSaveMember(member.id, "tiktokUsername", v)
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
  onSave: (next: string) => Promise<void>;
}

function CompactField({
  label,
  value,
  placeholder,
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
    const normalized =
      label === "X handle" || label === "TikTok handle"
        ? draft.trim().replace(/^@/, "")
        : draft.trim();
    if (normalized === value) return;
    await onSave(normalized);
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
    isEmpty ? "italic text-fg-subtle" : "text-fg",
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
          className="w-full rounded px-1 py-[2px] text-[14px] leading-[20px] text-fg outline outline-1 outline-border-strong focus-visible:outline-accent"
        />
      ) : (
        <button type="button" onClick={startEdit} className={displayClass}>
          {isEmpty ? placeholder : value}
        </button>
      )}
    </div>
  );
}
