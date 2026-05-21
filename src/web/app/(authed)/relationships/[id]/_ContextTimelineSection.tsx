"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  Interaction,
  InteractionCategory,
  InteractionStatus,
} from "@related/shared";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Section,
  Select,
  Textarea,
} from "@/components/ui";
import {
  fmtDay,
  fmtTime,
  fromLocalDtInput,
  toLocalDtInput,
} from "./_dateFormat";

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

interface Props {
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

export function ContextTimelineSection({
  interactions,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
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
