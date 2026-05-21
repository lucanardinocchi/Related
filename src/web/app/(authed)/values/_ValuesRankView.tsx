"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import {
  MIN_ALIGNED_FOR_RANKING,
  type ValuesCharacter,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, EmptyState } from "@/components/ui";
import { ValuesConfirmPanel } from "./_ValuesConfirmPanel";

interface Props {
  characters: ValuesCharacter[];
  alignments: Record<string, boolean>;
  initialOrder: string[];
}

export function ValuesRankView({
  characters,
  alignments,
  initialOrder,
}: Props) {
  const alignedCharacters = useMemo(
    () => characters.filter((c) => alignments[c.id] === true),
    [characters, alignments],
  );

  const defaultOrder = useMemo(() => {
    if (initialOrder.length > 0) {
      const known = new Set(initialOrder);
      const rest = alignedCharacters
        .map((c) => c.id)
        .filter((id) => !known.has(id));
      return [...initialOrder.filter((id) => alignments[id] === true), ...rest];
    }
    return alignedCharacters.map((c) => c.id);
  }, [alignedCharacters, alignments, initialOrder]);

  const [orderedIds, setOrderedIds] = useState(defaultOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialOrder.length > 0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters],
  );

  const moveItem = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setOrderedIds((prev) => {
      const fromIndex = prev.indexOf(fromId);
      const toIndex = prev.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromId);
      return next;
    });
  }, []);

  async function onSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await getBrowserDeps().valuesAlignment.saveRankings(orderedIds);
      setSaved(true);
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save your ranking",
      );
    } finally {
      setSaving(false);
    }
  }

  if (alignedCharacters.length < MIN_ALIGNED_FOR_RANKING) {
    return (
      <EmptyState
        title="Not enough alignments yet"
        description={`Align with at least ${MIN_ALIGNED_FOR_RANKING} characters before ranking.`}
        action={
          <Link href="/values">
            <Button variant="primary">Back to swiping</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <Card className="border border-border/60 bg-surface/80">
        <p className="text-[14px] leading-[22px] text-fg-muted">
          Drag to order the characters you aligned with — strongest resonance at
          the top.
        </p>
      </Card>

      <ol className="space-y-2">
        {orderedIds.map((id, index) => {
          const character = characterById.get(id);
          if (!character) return null;

          return (
            <li
              key={id}
              draggable
              onDragStart={() => setDraggingId(id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={() => {
                if (draggingId) moveItem(draggingId, id);
                setDraggingId(null);
              }}
              className="flex cursor-grab items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 active:cursor-grabbing"
            >
              <span className="w-6 shrink-0 text-center font-[family-name:var(--font-jetbrains-mono)] text-[14px] tabular-nums text-fg-subtle">
                {index + 1}
              </span>
              <GripVertical size={18} className="shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-fg">
                  {character.name}
                </div>
                <div className="truncate text-[13px] text-fg-muted">
                  {character.source}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {saveError && <p className="text-[13px] text-danger">{saveError}</p>}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" loading={saving} onClick={() => void onSave()}>
          {saved ? "Update ranking" : "Save ranking"}
        </Button>
        <Link href="/values">
          <Button variant="secondary">Back to swiping</Button>
        </Link>
      </div>

      {saved && (
        <ValuesConfirmPanel alignments={alignments} characters={characters} />
      )}
    </div>
  );
}
