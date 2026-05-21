"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Plus } from "lucide-react";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  OpenThread,
  SetCommitmentMetaInput,
} from "@related/shared";
import { Button, EmptyState, Input, Section } from "@/components/ui";
import { OpenThreadRow } from "@/components/open-threads/OpenThreadRow";

interface Props {
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

export function OpenThreadsSection({
  threads,
  onAdd,
  onEditDescription,
  onSetOrigin,
  onSetStatus,
  onClose,
}: Props) {
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
            <OpenThreadRow
              key={t.id}
              thread={t}
              onUpdateDescription={(d) => onEditDescription(t.id, d)}
              onSetCommitmentMeta={(meta) => applyCommitmentMeta(t.id, meta, {
                onSetOrigin,
                onSetStatus,
              })}
              onClose={() => onClose(t.id)}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

async function applyCommitmentMeta(
  id: string,
  meta: SetCommitmentMetaInput,
  handlers: {
    onSetOrigin: (id: string, origin: CommitmentOrigin | "") => Promise<void>;
    onSetStatus: (
      id: string,
      status: CommitmentCommunicationStatus,
    ) => Promise<void>;
  },
) {
  if ("origin" in meta) {
    await handlers.onSetOrigin(id, meta.origin === null ? "" : (meta.origin ?? ""));
    return;
  }
  if ("communicationStatus" in meta && meta.communicationStatus !== undefined) {
    await handlers.onSetStatus(id, meta.communicationStatus);
  }
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
