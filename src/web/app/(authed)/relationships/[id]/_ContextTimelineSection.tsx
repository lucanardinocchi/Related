"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  Interaction,
  InteractionCategory,
  InteractionStatus,
  OpenThread,
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
import { AddContextModal, type AddContextResult } from "./_AddContextModal";
import {
  commsKindLabel,
  contextFamilyFromInteraction,
  isCommsKind,
  timelineVisualForInteraction,
  timelineVisualForOpenThread,
  toneClasses,
  type ContextFamily,
} from "./_contextTypes";

const EDIT_KINDS = [
  "note",
  "event",
  "commitment",
  "email",
  "imessage",
  "sms",
  "phone_call",
  "whatsapp",
  "instagram_dm",
  "x_dm",
  "tiktok_dm",
] as const;

interface Props {
  interactions: Interaction[];
  openThreads?: OpenThread[];
  onAdd: (input: {
    time: string;
    kind: string;
    category: InteractionCategory;
    notes: string | null;
    status: InteractionStatus;
  }) => Promise<void>;
  onAddFromModal?: (result: AddContextResult) => Promise<void>;
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

type TimelineItem =
  | { key: string; sortTime: number; kind: "interaction"; data: Interaction }
  | { key: string; sortTime: number; kind: "thread"; data: OpenThread };

export function ContextTimelineSection({
  interactions,
  openThreads = [],
  onAdd,
  onAddFromModal,
  onEdit,
  onDelete,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const items = useMemo(() => buildTimelineItems(interactions, openThreads), [
    interactions,
    openThreads,
  ]);

  async function handleModalSubmit(result: AddContextResult) {
    if (onAddFromModal) {
      await onAddFromModal(result);
      return;
    }
    if (result.interaction) {
      await onAdd({
        time: result.time,
        kind: result.interaction.kind,
        category: result.interaction.category,
        notes: result.notes,
        status: result.interaction.status,
      });
    }
  }

  return (
    <>
      <Section
        title="Context"
        meta={
          items.length === 0
            ? undefined
            : `${items.length} entr${items.length === 1 ? "y" : "ies"}`
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus size={14} />}
            onClick={() => setModalOpen(true)}
          >
            Add context
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState
            title="No context yet"
            description="Interactions, notes, comms, and commitments — everything you'd like the agent to remember."
          />
        ) : (
          <ol className="divide-y divide-divider">
            {items.map((item) =>
              item.kind === "thread" ? (
                <PlannedCommitmentRow key={item.key} thread={item.data} />
              ) : (
                <ContextEntry
                  key={item.key}
                  entry={item.data}
                  onEdit={(patch) => onEdit(item.data.id, patch)}
                  onDelete={() => onDelete(item.data.id)}
                />
              ),
            )}
          </ol>
        )}
      </Section>

      <AddContextModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
      />
    </>
  );
}

function buildTimelineItems(
  interactions: Interaction[],
  openThreads: OpenThread[],
): TimelineItem[] {
  const rows: TimelineItem[] = [
    ...interactions.map((i) => ({
      key: `i-${i.id}`,
      sortTime: new Date(i.time).getTime(),
      kind: "interaction" as const,
      data: i,
    })),
    ...openThreads
      .filter((t) => t.closedAt === null)
      .map((t) => ({
        key: `t-${t.id}`,
        sortTime: new Date(t.createdAt).getTime(),
        kind: "thread" as const,
        data: t,
      })),
  ];
  return rows.sort((a, b) => b.sortTime - a.sortTime);
}

function PlannedCommitmentRow({ thread }: { thread: OpenThread }) {
  const visual = timelineVisualForOpenThread(thread);
  const tones = toneClasses(visual.tone);

  return (
    <li className="grid grid-cols-[150px_1fr] items-start gap-4 py-3">
      <div className="select-none pt-[1px] font-[family-name:var(--font-jetbrains-mono)] text-[12px] leading-[18px] tabular-nums text-fg-muted">
        <div>{fmtDay(thread.createdAt)}</div>
        <div className="text-fg-subtle">{fmtTime(thread.createdAt)}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[11px] font-medium uppercase tracking-[0.06em] ${tones.family}`}
          >
            {visual.familyLabel}
          </span>
          {visual.timingLabel && (
            <Badge tone={tones.timing}>{visual.timingLabel}</Badge>
          )}
        </div>
        <div className="mt-1 text-[14px] font-medium text-fg">
          {visual.headline}
        </div>
        <p className="mt-1 text-[12px] text-fg-subtle">
          Open in Open threads below
        </p>
      </div>
    </li>
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
  const visual = timelineVisualForInteraction(entry);
  const tones = toneClasses(visual.tone);
  const family = contextFamilyFromInteraction(entry);

  if (editing) {
    return (
      <li className="py-3">
        <ContextEntryEditor
          mode="edit"
          family={family}
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

  return (
    <li className="group grid grid-cols-[150px_1fr_auto] items-start gap-4 py-3">
      <div className="select-none pt-[1px] font-[family-name:var(--font-jetbrains-mono)] text-[12px] leading-[18px] tabular-nums text-fg-muted">
        <div>{fmtDay(entry.time)}</div>
        <div className="text-fg-subtle">{fmtTime(entry.time)}</div>
      </div>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 rounded text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[11px] font-medium uppercase tracking-[0.06em] ${tones.family}`}
          >
            {visual.familyLabel}
          </span>
          {visual.timingLabel && (
            <Badge tone={tones.timing}>{visual.timingLabel}</Badge>
          )}
        </div>
        <div className="mt-1 text-[14px] font-medium text-fg">
          {visual.headline}
        </div>
        {visual.subline && (
          <div className="mt-1 whitespace-pre-wrap text-[14px] leading-[22px] text-fg-muted">
            {visual.subline}
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
  family,
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: {
  mode: "create" | "edit";
  family: ContextFamily;
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
    const base = [...EDIT_KINDS];
    const seen = new Set<string>(base);
    const extras: string[] = [];
    if (initial && !seen.has(initial.kind)) extras.push(initial.kind);
    return [...base, ...extras];
  })();

  const showCategory = family === "interaction";
  const showStatus =
    family === "interaction" || family === "commitment" || family === "comms";

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

  function kindOptionLabel(k: string): string {
    if (k === "note") return "Note";
    if (k === "commitment") return "Commitment";
    if (isCommsKind(k)) return commsKindLabel(k);
    return k.replace(/_/g, " ");
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
                {kindOptionLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        {showCategory && (
          <Field label="Category">
            <Select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as InteractionCategory)
              }
              disabled={busy}
            >
              {(["personal", "meeting", "activity", "work", "errands"] as const).map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </Select>
          </Field>
        )}
        {showStatus && (
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as InteractionStatus)}
              disabled={busy}
            >
              {(
                [
                  "occurred",
                  "planned",
                  "attended",
                  "missed",
                  "cancelled",
                ] as InteractionStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened? What did they say?"
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
