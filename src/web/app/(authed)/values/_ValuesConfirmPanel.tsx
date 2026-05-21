"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  ValuesAlignmentClient,
  type ValuesCharacter,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, Checkbox, Input } from "@/components/ui";

export const MIN_SWIPES_FOR_INFERENCE = 10;

interface ProposedGoalRow {
  id: string;
  text: string;
  selected: boolean;
}

interface Props {
  alignments: Record<string, boolean>;
  characters: ValuesCharacter[];
}

function nextRowId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ValuesConfirmPanel({ alignments, characters }: Props) {
  const reviewedCount = useMemo(
    () =>
      characters.filter((character) => alignments[character.id] !== undefined)
        .length,
    [alignments, characters],
  );

  const [expanded, setExpanded] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProposedGoalRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const thresholdReached = reviewedCount >= MIN_SWIPES_FOR_INFERENCE;

  useEffect(() => {
    if (thresholdReached && rows.length === 0 && addedCount === null) {
      setExpanded(true);
    }
  }, [thresholdReached, rows.length, addedCount]);

  const runInference = useCallback(async () => {
    setInferError(null);
    setAddedCount(null);
    setInferring(true);
    try {
      const payload = ValuesAlignmentClient.buildInferencePayload(
        alignments,
        characters,
      );
      const proposed = await getBrowserDeps().valuesAlignment.inferProposedGoals(
        payload,
      );
      setRows(
        proposed.map((text) => ({
          id: nextRowId(),
          text,
          selected: true,
        })),
      );
      setExpanded(true);
    } catch (err: unknown) {
      setInferError(
        err instanceof Error ? err.message : "Could not infer your values",
      );
    } finally {
      setInferring(false);
    }
  }, [alignments, characters]);

  async function onAddToContext() {
    const selected = rows.filter((row) => row.selected && row.text.trim());
    if (selected.length === 0) return;

    setAddError(null);
    setAdding(true);
    try {
      const { userContext } = getBrowserDeps();
      for (const row of selected) {
        await userContext.addGoal(row.text.trim());
      }
      setAddedCount(selected.length);
      setRows([]);
      setExpanded(false);
    } catch (err: unknown) {
      setAddError(
        err instanceof Error ? err.message : "Could not add goals to Context",
      );
    } finally {
      setAdding(false);
    }
  }

  if (!thresholdReached) return null;

  if (addedCount !== null) {
    return (
      <Card className="border border-success/30 bg-success/5">
        <p className="text-[14px] leading-[22px] text-fg">
          Added {addedCount} goal{addedCount === 1 ? "" : "s"} to your Context.
        </p>
        <Link
          href="/context"
          className="mt-3 inline-block text-[14px] text-fg underline-offset-4 hover:underline"
        >
          View in Context →
        </Link>
      </Card>
    );
  }

  return (
    <Card className="border border-border/60 bg-surface/80">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            Values discovery
          </div>
          <p className="mt-2 max-w-lg text-[14px] leading-[22px] text-fg-muted">
            You&apos;ve reviewed {reviewedCount} characters. Related can propose
            goals based on who you aligned with — you choose what to keep.
          </p>
        </div>
        {rows.length === 0 && (
          <Button
            variant="primary"
            size="sm"
            loading={inferring}
            leading={<Sparkles size={14} />}
            onClick={() => void runInference()}
          >
            Discover your values
          </Button>
        )}
      </div>

      {inferError && (
        <p className="mt-3 text-[13px] text-danger">{inferError}</p>
      )}

      {rows.length > 0 && expanded && (
        <div className="mt-5 space-y-3">
          <p className="text-[13px] text-fg-subtle">
            Edit or deselect any proposal before adding to Context.
          </p>
          {rows.map((row) => (
            <label
              key={row.id}
              className="flex items-start gap-3 rounded-lg border border-divider/70 bg-surface px-3 py-2.5"
            >
              <Checkbox
                checked={row.selected}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, selected: checked } : item,
                    ),
                  );
                }}
                className="mt-1"
              />
              <Input
                value={row.text}
                onChange={(event) => {
                  const text = event.target.value;
                  setRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, text } : item,
                    ),
                  );
                }}
                className="flex-1"
              />
            </label>
          ))}

          {addError && (
            <p className="text-[13px] text-danger">{addError}</p>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              variant="primary"
              loading={adding}
              disabled={!rows.some((row) => row.selected && row.text.trim())}
              onClick={() => void onAddToContext()}
            >
              Add to Context
            </Button>
            <Button
              variant="secondary"
              disabled={inferring || adding}
              onClick={() => void runInference()}
            >
              Regenerate
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
