"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { User, Users } from "lucide-react";
import { getBrowserDeps } from "@/lib/deps/client";
import { cn } from "@/lib/cn";
import { FormField } from "@/components/ui/FormField";
import { Badge, Button, Input, Modal } from "@/components/ui";
import type { AssignableRelationship } from "@/components/open-threads/OpenThreadRow";

type Step = "description" | "relationship";

interface Props {
  assignableRelationships: AssignableRelationship[];
}

const STEP_NUMBER: Record<Step, number> = {
  description: 1,
  relationship: 2,
};

function stepTitle(step: Step): string {
  if (step === "description") return "New commitment";
  return "Who is this for?";
}

function stepSubtitle(step: Step): string {
  if (step === "description") {
    return "What do you owe someone? Keep it short — you can add context later.";
  }
  return "Pick the person or group this commitment is for.";
}

export function NewCommitmentModal({ assignableRelationships }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get("new") === "1";

  const [step, setStep] = useState<Step>("description");
  const [description, setDescription] = useState("");
  const [relationshipSearch, setRelationshipSearch] = useState("");
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setStep("description");
    setDescription("");
    setRelationshipSearch("");
    setRelationshipId(null);
    setSubmitting(false);
    setError(null);
  }, []);

  const close = useCallback(() => {
    router.push("/commitments", { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  const filteredRelationships = assignableRelationships.filter((relationship) =>
    relationshipSearch === ""
      ? true
      : relationship.label
          .toLowerCase()
          .includes(relationshipSearch.toLowerCase()),
  );

  const canContinue =
    step === "description" ? description.trim().length > 0 : relationshipId !== null;

  function goBack() {
    setError(null);
    if (step === "relationship") {
      setStep("description");
    }
  }

  function goNext() {
    setError(null);
    if (step === "description") {
      setStep("relationship");
    }
  }

  async function submit() {
    if (submitting || !relationshipId) return;
    const trimmed = description.trim();
    if (!trimmed) {
      setError("Description is required.");
      setStep("description");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const deps = getBrowserDeps();
      await deps.openThreads.createOpenThread({
        description: trimmed,
        direction: "me_owes_them",
        relationshipIds: [relationshipId],
      });

      router.push("/commitments", { scroll: false });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create commitment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <>
      {step !== "description" ? (
        <Button variant="ghost" onClick={goBack} disabled={submitting}>
          Back
        </Button>
      ) : (
        <Button variant="ghost" onClick={close} disabled={submitting}>
          Cancel
        </Button>
      )}
      {step === "relationship" ? (
        <Button variant="primary" onClick={submit} loading={submitting}>
          Add commitment
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={goNext}
          disabled={!canContinue || submitting}
        >
          Continue
        </Button>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={stepTitle(step)}
      subtitle={`Step ${STEP_NUMBER[step]} of 2 · ${stepSubtitle(step)}`}
      footer={footer}
      size="md"
      className="flex max-h-[min(85vh,640px)] flex-col"
    >
      <div className="-mx-5 max-h-[min(52vh,420px)] overflow-y-auto px-5">
        {step === "description" && (
          <FormField label="What do I owe?" htmlFor="commitment-description">
            <Input
              id="commitment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. send the photos from Saturday"
              autoFocus
            />
          </FormField>
        )}

        {step === "relationship" && (
          <div className="space-y-3">
            {assignableRelationships.length === 0 ? (
              <p className="text-[14px] text-fg-muted">
                No relationships yet.{" "}
                <Link
                  href="/relationships?new=1"
                  className="text-accent hover:underline"
                >
                  Add one first
                </Link>{" "}
                to attach a commitment.
              </p>
            ) : (
              <>
                <Input
                  value={relationshipSearch}
                  onChange={(event) => setRelationshipSearch(event.target.value)}
                  placeholder="Search people and groups"
                  autoFocus
                />
                {filteredRelationships.length === 0 ? (
                  <p className="text-[14px] text-fg-subtle">
                    No matching relationships.
                  </p>
                ) : (
                  <ul className="divide-y divide-divider rounded-md border border-divider">
                    {filteredRelationships.map((relationship) => (
                      <li key={relationship.id}>
                        <RelationshipOption
                          selected={relationshipId === relationship.id}
                          icon={
                            relationship.kind === "group" ? (
                              <Users size={16} className="text-fg-subtle" />
                            ) : (
                              <User size={16} className="text-fg-subtle" />
                            )
                          }
                          label={relationship.label}
                          kind={relationship.kind}
                          onSelect={() => setRelationshipId(relationship.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4">
            <Badge tone="danger">{error}</Badge>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface RelationshipOptionProps {
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  kind: "contact" | "group";
  onSelect: () => void;
}

function RelationshipOption({
  selected,
  icon,
  label,
  kind,
  onSelect,
}: RelationshipOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
        selected ? "bg-accent/5" : "hover:bg-hover",
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-fg">{label}</div>
        <div className="text-[12px] text-fg-subtle">
          {kind === "group" ? "Group" : "Individual"}
        </div>
      </div>
    </button>
  );
}
