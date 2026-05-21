"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  MAX_RANKED_ALIGNMENTS,
  ValuesAlignmentClient,
  type CharacterValuesAlignment,
  type ValuesCharacter,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, Checkbox, Input, Textarea } from "@/components/ui";

interface ProposedGoalRow {
  id: string;
  text: string;
  selected: boolean;
}

interface Props {
  rankedCharacterIds: string[];
  alignmentRows: CharacterValuesAlignment[];
}

function nextRowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatValueSetForContext(values: string[]): string {
  return `My core values: ${values.join(", ")}.`;
}

function formatAttitudeForContext(attitude: string): string {
  const trimmed = attitude.trim();
  if (/^you /i.test(trimmed)) {
    return trimmed.replace(/^you /i, "I ");
  }
  return trimmed;
}

/** Confirm gate for Values Discovery — AI proposals become G&V only after User action. See ADR-0011. */
export function ValuesConfirmPanel({
  rankedCharacterIds,
  alignmentRows,
}: Props) {
  const rankingReady = rankedCharacterIds.length >= MAX_RANKED_ALIGNMENTS;

  const [expanded, setExpanded] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);
  const [includeValueSet, setIncludeValueSet] = useState(true);
  const [includeAttitude, setIncludeAttitude] = useState(true);
  const [valueSet, setValueSet] = useState<string[]>([]);
  const [attitude, setAttitude] = useState("");
  const [goalRows, setGoalRows] = useState<ProposedGoalRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const hasProposal = valueSet.length > 0 || attitude.trim().length > 0;

  const canAddToContext = useMemo(() => {
    const selectedGoals = goalRows.filter(
      (row) => row.selected && row.text.trim(),
    );
    const valueSetReady = includeValueSet && valueSet.some((value) => value.trim());
    const attitudeReady = includeAttitude && attitude.trim().length > 0;
    return valueSetReady || attitudeReady || selectedGoals.length > 0;
  }, [attitude, goalRows, includeAttitude, includeValueSet, valueSet]);

  useEffect(() => {
    if (rankingReady && !hasProposal && addedCount === null) {
      setExpanded(true);
    }
  }, [rankingReady, hasProposal, addedCount]);

  const runInference = useCallback(async () => {
    setInferError(null);
    setAddedCount(null);
    setInferring(true);
    try {
      const payload = ValuesAlignmentClient.buildRankedInferencePayloadFromRows(
        alignmentRows,
        rankedCharacterIds,
      );
      const proposed = await getBrowserDeps().valuesAlignment.inferProposedProfile(
        payload,
      );
      setValueSet(proposed.valueSet);
      setAttitude(proposed.attitude);
      setGoalRows(
        proposed.goals.map((text) => ({
          id: nextRowId("goal"),
          text,
          selected: true,
        })),
      );
      setIncludeValueSet(true);
      setIncludeAttitude(true);
      setExpanded(true);
    } catch (err: unknown) {
      setInferError(
        err instanceof Error ? err.message : "Could not infer your values",
      );
    } finally {
      setInferring(false);
    }
  }, [alignmentRows, rankedCharacterIds]);

  async function onAddToContext() {
    const entries: string[] = [];

    const trimmedValues = valueSet.map((value) => value.trim()).filter(Boolean);
    if (includeValueSet && trimmedValues.length > 0) {
      entries.push(formatValueSetForContext(trimmedValues));
    }

    if (includeAttitude && attitude.trim()) {
      entries.push(formatAttitudeForContext(attitude));
    }

    for (const row of goalRows) {
      if (row.selected && row.text.trim()) {
        entries.push(row.text.trim());
      }
    }

    if (entries.length === 0) return;

    setAddError(null);
    setAdding(true);
    try {
      const { userContext } = getBrowserDeps();
      for (const entry of entries) {
        await userContext.addGoal(entry);
      }
      setAddedCount(entries.length);
      setValueSet([]);
      setAttitude("");
      setGoalRows([]);
      setExpanded(false);
    } catch (err: unknown) {
      setAddError(
        err instanceof Error ? err.message : "Could not add goals to Context",
      );
    } finally {
      setAdding(false);
    }
  }

  if (!rankingReady) return null;

  if (addedCount !== null) {
    return (
      <Card className="border border-success/30 bg-success/5">
        <p className="text-[14px] leading-[22px] text-fg">
          Added {addedCount} {addedCount === 1 ? "entry" : "entries"} to your
          Context.
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
            Related analyzes your top {MAX_RANKED_ALIGNMENTS} ranked characters
            to suggest a common value set and how you want to show up — you
            choose what to keep.
          </p>
        </div>
        {!hasProposal && (
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

      {hasProposal && expanded && (
        <div className="mt-5 space-y-6">
          <p className="text-[13px] text-fg-subtle">
            Edit or deselect any proposal before adding to Context.
          </p>

          <section className="space-y-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={includeValueSet}
                onChange={(event) => setIncludeValueSet(event.target.checked)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-[13px] font-medium text-fg">
                  Common value set
                </div>
                <div className="space-y-2">
                  {valueSet.map((value, index) => (
                    <Input
                      key={`value-${index}`}
                      value={value}
                      onChange={(event) => {
                        const next = event.target.value;
                        setValueSet((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index ? next : item,
                          ),
                        );
                      }}
                    />
                  ))}
                </div>
              </div>
            </label>
          </section>

          <section className="space-y-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={includeAttitude}
                onChange={(event) => setIncludeAttitude(event.target.checked)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-[13px] font-medium text-fg">
                  Personality &amp; attitude
                </div>
                <Textarea
                  value={attitude}
                  rows={3}
                  onChange={(event) => setAttitude(event.target.value)}
                />
              </div>
            </label>
          </section>

          {goalRows.length > 0 && (
            <section className="space-y-3">
              <div className="text-[13px] font-medium text-fg">
                Goal statements
              </div>
              {goalRows.map((row) => (
                <label
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border border-divider/70 bg-surface px-3 py-2.5"
                >
                  <Checkbox
                    checked={row.selected}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setGoalRows((prev) =>
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
                      setGoalRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, text } : item,
                        ),
                      );
                    }}
                    className="flex-1"
                  />
                </label>
              ))}
            </section>
          )}

          {addError && (
            <p className="text-[13px] text-danger">{addError}</p>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              variant="primary"
              loading={adding}
              disabled={!canAddToContext}
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
