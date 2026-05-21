"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, GripVertical, MoreHorizontal } from "lucide-react";
import {
  MAX_RANKED_ALIGNMENTS,
  MIN_ALIGNED_FOR_RANKING,
  type CharacterValuesAlignment,
  type ValuesCharacter,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, EmptyState, Modal } from "@/components/ui";
import { ValuesConfirmPanel } from "./_ValuesConfirmPanel";

interface Props {
  characters: ValuesCharacter[];
  alignments: Record<string, boolean>;
  initialOrder: string[];
  alignmentRows: CharacterValuesAlignment[];
}

function splitRankAndOverflow(
  alignedIds: string[],
  savedOrder: string[],
): { rankedIds: string[]; overflowIds: string[] } {
  const alignedSet = new Set(alignedIds);
  const ordered =
    savedOrder.length > 0
      ? [
          ...savedOrder.filter((id) => alignedSet.has(id)),
          ...alignedIds.filter((id) => !savedOrder.includes(id)),
        ]
      : alignedIds;

  return {
    rankedIds: ordered.slice(0, MAX_RANKED_ALIGNMENTS),
    overflowIds: ordered.slice(MAX_RANKED_ALIGNMENTS),
  };
}

export function ValuesRankView({
  characters,
  alignments,
  initialOrder,
  alignmentRows,
}: Props) {
  const alignedCharacters = useMemo(
    () => characters.filter((c) => alignments[c.id] === true),
    [characters, alignments],
  );

  const alignedIds = useMemo(
    () => alignedCharacters.map((c) => c.id),
    [alignedCharacters],
  );

  const initialSplit = useMemo(
    () => splitRankAndOverflow(alignedIds, initialOrder),
    [alignedIds, initialOrder],
  );

  const [rankedIds, setRankedIds] = useState(initialSplit.rankedIds);
  const [overflowIds, setOverflowIds] = useState(initialSplit.overflowIds);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialOrder.length > 0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters],
  );

  const moveItem = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setRankedIds((prev) => {
      const fromIndex = prev.indexOf(fromId);
      const toIndex = prev.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromId);
      return next;
    });
    setSaved(false);
  }, []);

  const promoteToTop = useCallback((id: string) => {
    setRankedIds((prevRanked) => {
      if (prevRanked.includes(id)) return prevRanked;

      const kicked =
        prevRanked.length >= MAX_RANKED_ALIGNMENTS
          ? prevRanked[MAX_RANKED_ALIGNMENTS - 1]
          : null;
      const nextRanked = [id, ...prevRanked.slice(0, MAX_RANKED_ALIGNMENTS - 1)];

      setOverflowIds((prevOverflow) => {
        const withoutPromoted = prevOverflow.filter((overflowId) => overflowId !== id);
        return kicked ? [kicked, ...withoutPromoted] : withoutPromoted;
      });

      return nextRanked;
    });
    setSaved(false);
  }, []);

  async function onSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await getBrowserDeps().valuesAlignment.saveRankings(rankedIds);
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
          Drag to order your top {MAX_RANKED_ALIGNMENTS} alignments — strongest
          resonance at the top. Use{" "}
          <span className="font-medium text-fg">Move to #1</span> on any other
          alignment to swap it in and drop #{MAX_RANKED_ALIGNMENTS}.
        </p>
      </Card>

      <ol className="space-y-2">
        {rankedIds.map((id, index) => {
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

      {overflowIds.length > 0 && (
        <Button
          variant="secondary"
          className="w-full justify-center"
          leading={<MoreHorizontal size={16} />}
          onClick={() => setOverflowOpen(true)}
        >
          {overflowIds.length} more alignment
          {overflowIds.length === 1 ? "" : "s"}
        </Button>
      )}

      <Modal
        open={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        title="More alignments"
        subtitle={`Move one to #1 — it replaces whoever is currently ranked ${MAX_RANKED_ALIGNMENTS}.`}
        size="sm"
      >
        <ul className="max-h-[min(60vh,420px)] space-y-2 overflow-y-auto">
          {overflowIds.map((id) => {
            const character = characterById.get(id);
            if (!character) return null;

            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-fg">
                    {character.name}
                  </div>
                  <div className="truncate text-[13px] text-fg-muted">
                    {character.source}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<ArrowUp size={14} />}
                  onClick={() => {
                    promoteToTop(id);
                    setOverflowOpen(false);
                  }}
                >
                  Move to #1
                </Button>
              </li>
            );
          })}
        </ul>
      </Modal>

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
        <ValuesConfirmPanel
          rankedCharacterIds={rankedIds}
          alignmentRows={alignmentRows}
        />
      )}
    </div>
  );
}
