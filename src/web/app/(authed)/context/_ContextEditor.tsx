"use client";

import type { Goal, SituationalState } from "@related/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { getBrowserDeps } from "@/lib/deps/client";

interface ContextEditorProps {
  initialGoals: Goal[];
  initialSituationalState: SituationalState | null;
}

export function ContextEditor({
  initialGoals,
  initialSituationalState,
}: ContextEditorProps) {
  return (
    <div className="space-y-10">
      <SituationalStateSection initial={initialSituationalState} />
      <GoalsSection initialGoals={initialGoals} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Situational State
// ---------------------------------------------------------------------------

function SituationalStateSection({
  initial,
}: {
  initial: SituationalState | null;
}) {
  const [content, setContent] = useState(initial?.content ?? "");
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    initial?.updatedAt ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSavedNotice(false);
    setSaving(true);
    try {
      const next = await getBrowserDeps().userContext.setSituationalState(
        content.trim(),
      );
      setUpdatedAt(next.updatedAt);
      setSavedNotice(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save situational state",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Situational state
        </h2>
        <p className="mt-1 text-sm text-muted">
          What&apos;s going on for you right now? A sentence or two — recent
          moves, new role, busy season, anything Related should know.
        </p>
      </div>

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField label="Right now" htmlFor="situational-state">
            <Textarea
              id="situational-state"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Just moved to Sydney; new role at work; settling in."
            />
          </FormField>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              {savedNotice
                ? "Saved."
                : updatedAt
                  ? `Last updated ${formatTimestamp(updatedAt)}.`
                  : "Not set yet."}
            </p>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Goals & Values
// ---------------------------------------------------------------------------

function GoalsSection({ initialGoals }: { initialGoals: Goal[] }) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setAddError(null);
    setAdding(true);
    // Optimistically clear the input so the User can keep typing.
    setNewContent("");
    try {
      const created = await getBrowserDeps().userContext.addGoal(trimmed);
      setGoals((prev) => [created, ...prev]);
    } catch (err: unknown) {
      // Restore the text so they don't lose it.
      setNewContent(trimmed);
      setAddError(err instanceof Error ? err.message : "Could not add goal");
    } finally {
      setAdding(false);
    }
  }

  function handleUpdated(id: string, content: string, updatedAt: string) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, content, updatedAt } : g)),
    );
  }

  function handleDeleted(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Goals &amp; values
        </h2>
        <p className="mt-1 text-sm text-muted">
          Long-running things you care about. One per row. Related uses these to
          shape its suggestions.
        </p>
      </div>

      <Card>
        <div className="space-y-3">
          {goals.length === 0 ? (
            <p className="text-sm text-muted">
              No goals yet. Add your first one below.
            </p>
          ) : (
            goals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))
          )}

          <form
            className="flex items-start gap-2 pt-2"
            onSubmit={onAdd}
          >
            <div className="flex-1">
              <Input
                aria-label="New goal"
                placeholder="e.g. Be more present with family"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
              {addError && (
                <p className="mt-1 text-xs text-danger">{addError}</p>
              )}
            </div>
            <Button
              type="submit"
              loading={adding}
              disabled={!newContent.trim()}
            >
              Add
            </Button>
          </form>
        </div>
      </Card>
    </section>
  );
}

interface GoalRowProps {
  goal: Goal;
  onUpdated: (id: string, content: string, updatedAt: string) => void;
  onDeleted: (id: string) => void;
}

function GoalRow({ goal, onUpdated, onDeleted }: GoalRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(goal.content);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(goal.content);
    setError(null);
    setEditing(false);
  }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Goal can't be empty");
      return;
    }
    if (trimmed === goal.content) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getBrowserDeps().userContext.updateGoal(goal.id, trimmed);
      onUpdated(goal.id, trimmed, new Date().toISOString());
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete this goal?\n\n"${goal.content}"`)) return;
    setBusy(true);
    setError(null);
    try {
      await getBrowserDeps().userContext.deleteGoal(goal.id);
      onDeleted(goal.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-surface p-3">
        <Input
          aria-label="Edit goal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={cancelEdit}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} loading={busy}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-bg p-3">
      <p className="flex-1 text-sm">{goal.content}</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          onClick={startEdit}
          disabled={busy}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={remove}
          loading={busy}
        >
          Delete
        </Button>
      </div>
      {error && (
        <p className="mt-1 w-full text-xs text-danger">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
