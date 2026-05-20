"use client";

import { useState } from "react";
import type { CandidateAction, DecisionState } from "@related/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

interface CandidateActionCardProps {
  action: CandidateAction;
  decisionState: DecisionState;
  onAccept: (edits?: Record<string, unknown>) => void;
  onDecline: () => void;
}

/**
 * Returns the action's payload as a record so we can iterate over its
 * scalar fields. `payload` on CandidateAction is typed `unknown` to keep
 * the agent's tool-use schema flexible — narrow defensively here.
 */
function payloadAsRecord(action: CandidateAction): Record<string, unknown> {
  const p = action.payload;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return p as Record<string, unknown>;
  }
  return {};
}

const MULTILINE_KEYS = new Set(["body", "notes", "description", "message"]);

export function CandidateActionCard({
  action,
  decisionState,
  onAccept,
  onDecline,
}: CandidateActionCardProps) {
  const decided = decisionState !== "pending";
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, unknown>>(() =>
    payloadAsRecord(action),
  );

  const scalarFields = Object.entries(payloadAsRecord(action)).filter(
    ([, v]) => typeof v === "string",
  );

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold tracking-tight">{action.type}</div>
      {action.why && (
        <p className="mt-1 text-sm text-muted">{action.why}</p>
      )}

      {editing && scalarFields.length > 0 && (
        <div className="mt-3 space-y-3">
          {scalarFields.map(([key, value]) => {
            const current = (edits[key] as string) ?? (value as string);
            const multiline = MULTILINE_KEYS.has(key);
            return (
              <FormField key={key} label={key} htmlFor={`edit-${key}`}>
                {multiline ? (
                  <Textarea
                    id={`edit-${key}`}
                    rows={3}
                    value={current}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={`edit-${key}`}
                    value={current}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                )}
              </FormField>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {decided ? (
          <span className="text-xs uppercase tracking-wider text-muted">
            {decisionState === "picked" ? "Accepted" : "Declined"}
          </span>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => onAccept(editing ? edits : undefined)}
            >
              Accept
            </Button>
            <Button type="button" variant="secondary" onClick={onDecline}>
              Decline
            </Button>
            {scalarFields.length > 0 && !editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
