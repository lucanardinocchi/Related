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
import { Plus, Trash2, Users, X } from "lucide-react";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  Interaction,
  InteractionCategory,
  InteractionStatus,
  OpenThread,
  Relationship,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Badge,
  Button,
  EmptyState,
  Eyebrow,
  H1,
  Input,
  Mono,
  Section,
  Select,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { TouchpointsChart } from "./_TouchpointsChart";

// =========================================================================
// Domain helpers
// =========================================================================

const CONTEXT_KINDS = [
  "note",
  "event",
  "email",
  "sms",
  "phone_call",
  "whatsapp",
  "instagram_dm",
  "x_dm",
] as const;

const KIND_LABEL: Record<string, string> = {
  note: "Note",
  event: "Event",
  email: "Email",
  sms: "SMS",
  phone_call: "Phone call",
  whatsapp: "WhatsApp",
  instagram_dm: "Instagram DM",
  x_dm: "X DM",
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

const CATEGORIES: InteractionCategory[] = [
  "personal",
  "meeting",
  "activity",
  "work",
  "errands",
];

const STATUSES: InteractionStatus[] = [
  "occurred",
  "planned",
  "attended",
  "missed",
  "cancelled",
];

function statusTone(s: InteractionStatus): "approved" | "sent" | "lost" {
  if (s === "occurred" || s === "attended") return "approved";
  if (s === "planned") return "sent";
  return "lost";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalDtInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDtInput(local: string): string {
  return new Date(local).toISOString();
}

// =========================================================================
// Detail view
// =========================================================================

interface GroupSummary {
  id: string;
  name: string;
  relationshipId: string;
}

interface Props {
  relationship: Relationship;
  interactions: Interaction[];
  openThreads: OpenThread[];
  groupMemberships: GroupSummary[];
}

export function RelationshipDetailView({
  relationship: initialRelationship,
  interactions: initialInteractions,
  openThreads: initialOpenThreads,
  groupMemberships,
}: Props) {
  const deps = getBrowserDeps();
  const [relationship, setRelationship] = useState(initialRelationship);
  const [interactions, setInteractions] = useState<Interaction[]>(
    initialInteractions,
  );
  const [openThreads, setOpenThreads] = useState<OpenThread[]>(
    initialOpenThreads,
  );

  async function saveContact(
    field:
      | "name"
      | "phone"
      | "email"
      | "birthday"
      | "area"
      | "occupation"
      | "education",
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

  // -------- Open Threads --------------------------------------------------

  async function addThread(description: string): Promise<void> {
    const id = await deps.openThreads.createOpenThread({
      description,
      direction: "me_owes_them",
      relationshipIds: [relationship.id],
    });
    const created: OpenThread = {
      id,
      description,
      direction: "me_owes_them",
      origin: null,
      communicationStatus: "not_communicated",
      createdAt: new Date().toISOString(),
      closedAt: null,
      relationshipIds: [relationship.id],
      whyHelpsPerson: null,
      whyICanHelp: null,
    };
    setOpenThreads((ts) => [...ts, created]);
  }

  async function patchThreadDescription(id: string, description: string) {
    const updated = await deps.openThreads.updateOpenThread(id, {
      description,
    });
    setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
  }

  async function patchThreadOrigin(
    id: string,
    origin: CommitmentOrigin | "",
  ) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      origin: origin === "" ? null : origin,
    });
    setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
  }

  async function patchThreadStatus(
    id: string,
    communicationStatus: CommitmentCommunicationStatus,
  ) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      communicationStatus,
    });
    setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
  }

  async function closeThread(id: string) {
    await deps.openThreads.closeOpenThread(id);
    setOpenThreads((ts) => ts.filter((t) => t.id !== id));
  }

  // -------- Context (interactions) ---------------------------------------

  async function addContext(input: {
    time: string;
    kind: string;
    category: InteractionCategory;
    notes: string | null;
    status: InteractionStatus;
  }): Promise<void> {
    const id = await deps.interactions.createInteraction({
      ...input,
      contactIds: [relationship.contact.id],
    });
    const created: Interaction = {
      id,
      time: input.time,
      kind: input.kind,
      category: input.category,
      notes: input.notes,
      status: input.status,
      contacts: [
        { id: relationship.contact.id, name: relationship.contact.name },
      ],
    };
    setInteractions((xs) =>
      [created, ...xs].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      ),
    );
  }

  async function patchContext(
    id: string,
    patch: Partial<{
      time: string;
      kind: string;
      category: InteractionCategory;
      notes: string | null;
      status: InteractionStatus;
    }>,
  ) {
    const updated = await deps.interactions.updateInteraction(id, patch);
    setInteractions((xs) =>
      xs
        .map((i) => (i.id === id ? updated : i))
        .sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
        ),
    );
  }

  async function deleteContext(id: string) {
    await deps.interactions.deleteInteraction(id);
    setInteractions((xs) => xs.filter((i) => i.id !== id));
  }

  // -------- Render --------------------------------------------------------

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

      <OpenThreadsSection
        threads={openThreads}
        onAdd={addThread}
        onEditDescription={patchThreadDescription}
        onSetOrigin={patchThreadOrigin}
        onSetStatus={patchThreadStatus}
        onClose={closeThread}
      />

      <ContextSection
        interactions={interactions}
        onAdd={addContext}
        onEdit={patchContext}
        onDelete={deleteContext}
      />
    </div>
  );
}

// =========================================================================
// Key Details strip (unchanged from main)
// =========================================================================

interface KeyDetailsStripProps {
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

// =========================================================================
// Open Threads
// =========================================================================

interface OpenThreadsSectionProps {
  threads: OpenThread[];
  onAdd: (description: string) => Promise<void>;
  onEditDescription: (id: string, description: string) => Promise<void>;
  onSetOrigin: (id: string, origin: CommitmentOrigin | "") => Promise<void>;
  onSetStatus: (
    id: string,
    status: CommitmentCommunicationStatus,
  ) => Promise<void>;
  onClose: (id: string) => Promise<void>;
}

function OpenThreadsSection({
  threads,
  onAdd,
  onEditDescription,
  onSetOrigin,
  onSetStatus,
  onClose,
}: OpenThreadsSectionProps) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Open threads"
      meta={
        threads.length === 0 ? undefined : `${threads.length} open`
      }
      actions={
        adding ? null : (
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus size={14} />}
            onClick={() => setAdding(true)}
          >
            Add thread
          </Button>
        )
      }
    >
      {adding && (
        <AddThreadForm
          onSubmit={async (description) => {
            await onAdd(description);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {threads.length === 0 && !adding ? (
        <EmptyState
          title="No open threads"
          description="Commitments and unresolved items live here. Add one to start tracking what you owe."
        />
      ) : (
        <ul className="divide-y divide-divider">
          {threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              onEditDescription={(d) => onEditDescription(t.id, d)}
              onSetOrigin={(o) => onSetOrigin(t.id, o)}
              onSetStatus={(s) => onSetStatus(t.id, s)}
              onClose={() => onClose(t.id)}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function AddThreadForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  async function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="mb-3 flex items-center gap-2 py-2">
      <Input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder="What do I owe? e.g. send the photos from Saturday"
        disabled={busy}
      />
      <Button variant="primary" size="sm" onClick={submit} loading={busy}>
        Add
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}

function ThreadRow({
  thread,
  onEditDescription,
  onSetOrigin,
  onSetStatus,
  onClose,
}: {
  thread: OpenThread;
  onEditDescription: (description: string) => Promise<void>;
  onSetOrigin: (origin: CommitmentOrigin | "") => Promise<void>;
  onSetStatus: (status: CommitmentCommunicationStatus) => Promise<void>;
  onClose: () => Promise<void>;
}) {
  return (
    <li className="group flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-[240px] flex-1">
        <InlineEditableText
          value={thread.description}
          onSave={onEditDescription}
          className="text-[14px] leading-[22px] text-fg"
        />
        <div className="mt-1 text-[12px] text-fg-subtle">
          Opened {fmtDate(thread.createdAt)}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <span className="mb-0.5 text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            Origin
          </span>
          <Select
            value={thread.origin ?? ""}
            onChange={(e) =>
              onSetOrigin(e.target.value as CommitmentOrigin | "")
            }
            className="min-w-[150px]"
          >
            <option value="">Unset</option>
            <option value="asked_of_me">Asked of me</option>
            <option value="self_led">Self-led</option>
          </Select>
        </div>

        <div className="flex flex-col">
          <span className="mb-0.5 text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            Communication
          </span>
          <Select
            value={thread.communicationStatus}
            onChange={(e) =>
              onSetStatus(e.target.value as CommitmentCommunicationStatus)
            }
            className="min-w-[170px]"
          >
            <option value="not_communicated">Not communicated</option>
            <option value="confirmed">Confirmed</option>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </li>
  );
}

// =========================================================================
// Context timeline
// =========================================================================

interface ContextSectionProps {
  interactions: Interaction[];
  onAdd: (input: {
    time: string;
    kind: string;
    category: InteractionCategory;
    notes: string | null;
    status: InteractionStatus;
  }) => Promise<void>;
  onEdit: (
    id: string,
    patch: Partial<{
      time: string;
      kind: string;
      category: InteractionCategory;
      notes: string | null;
      status: InteractionStatus;
    }>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ContextSection({
  interactions,
  onAdd,
  onEdit,
  onDelete,
}: ContextSectionProps) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Context"
      meta={
        interactions.length === 0
          ? undefined
          : `${interactions.length} entr${interactions.length === 1 ? "y" : "ies"}`
      }
      actions={
        adding ? null : (
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus size={14} />}
            onClick={() => setAdding(true)}
          >
            Add context
          </Button>
        )
      }
    >
      {adding && (
        <ContextEntryEditor
          mode="create"
          onSubmit={async (input) => {
            await onAdd(input);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {interactions.length === 0 && !adding ? (
        <EmptyState
          title="No context yet"
          description="Notes, calls, messages, events — everything you'd like the agent to remember about this person."
        />
      ) : (
        <ol className="divide-y divide-divider">
          {interactions.map((i) => (
            <ContextEntry
              key={i.id}
              entry={i}
              onEdit={(patch) => onEdit(i.id, patch)}
              onDelete={() => onDelete(i.id)}
            />
          ))}
        </ol>
      )}
    </Section>
  );
}

function ContextEntry({
  entry,
  onEdit,
  onDelete,
}: {
  entry: Interaction;
  onEdit: (
    patch: Partial<{
      time: string;
      kind: string;
      category: InteractionCategory;
      notes: string | null;
      status: InteractionStatus;
    }>,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-3">
        <ContextEntryEditor
          mode="edit"
          initial={{
            time: entry.time,
            kind: entry.kind,
            category: entry.category,
            notes: entry.notes,
            status: entry.status,
          }}
          onSubmit={async (input) => {
            await onEdit(input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={async () => {
            await onDelete();
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const showStatusBadge = entry.status !== "occurred";

  return (
    <li className="group grid grid-cols-[150px_1fr_auto] items-start gap-4 py-3">
      <div className="select-none pt-[1px] font-[family-name:var(--font-jetbrains-mono)] text-[12px] leading-[18px] tabular-nums text-fg-muted">
        <div>{fmtDay(entry.time)}</div>
        <div className="text-fg-subtle">{fmtTime(entry.time)}</div>
      </div>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium text-fg">
            {kindLabel(entry.kind)}
          </span>
          {showStatusBadge && (
            <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
          )}
        </div>
        {entry.notes && (
          <div className="mt-1 whitespace-pre-wrap text-[14px] leading-[22px] text-fg-muted">
            {entry.notes}
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="invisible self-start rounded p-1 text-[12px] text-fg-subtle hover:bg-hover hover:text-fg group-hover:visible focus-visible:visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-label="Edit entry"
      >
        Edit
      </button>
    </li>
  );
}

interface ContextEditorValue {
  time: string;
  kind: string;
  category: InteractionCategory;
  notes: string | null;
  status: InteractionStatus;
}

function ContextEntryEditor({
  mode,
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: {
  mode: "create" | "edit";
  initial?: ContextEditorValue;
  onSubmit: (input: ContextEditorValue) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const seedTime = initial?.time ?? new Date().toISOString();
  const [time, setTime] = useState(toLocalDtInput(seedTime));
  const [kind, setKind] = useState(initial?.kind ?? "note");
  const [category, setCategory] = useState<InteractionCategory>(
    initial?.category ?? "personal",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<InteractionStatus>(
    initial?.status ?? "occurred",
  );
  const [busy, setBusy] = useState(false);

  const kindOptions = (() => {
    const seen = new Set<string>(CONTEXT_KINDS);
    const extras: string[] = [];
    if (initial && !seen.has(initial.kind)) extras.push(initial.kind);
    return [...CONTEXT_KINDS, ...extras];
  })();

  async function submit() {
    if (kind.trim().length === 0) return;
    setBusy(true);
    try {
      await onSubmit({
        time: fromLocalDtInput(time),
        kind: kind.trim(),
        category,
        notes: notes.trim() === "" ? null : notes,
        status,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="my-1 grid grid-cols-1 gap-3 rounded-md bg-surface p-3 md:grid-cols-[180px_1fr] md:items-start">
      <div className="flex flex-col gap-2">
        <Field label="When">
          <Input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Kind">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy}
          >
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as InteractionCategory)
            }
            disabled={busy}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as InteractionStatus)}
            disabled={busy}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened? What did they say? Anything you want to remember."
            rows={5}
            disabled={busy}
          />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={submit} loading={busy}>
              {mode === "create" ? "Add" : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={busy}
              leading={<X size={14} />}
            >
              Cancel
            </Button>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={busy}
              leading={<Trash2 size={14} />}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}

// =========================================================================
// Inline editable text (single-line)
// =========================================================================

function InlineEditableText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => setDraft(value), [value]);

  async function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next.length === 0 || next === value) return;
    await onSave(next);
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className={`w-full rounded px-1.5 py-[3px] outline outline-1 outline-border-strong focus-visible:outline-accent ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`w-full cursor-text select-text rounded px-1.5 py-[3px] text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className ?? ""}`}
    >
      {value}
    </button>
  );
}
