"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  type CommitmentCommunicationStatus,
  type CommitmentOrigin,
  type OpenThread,
  type PendingCandidateForUser,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Button,
  Display,
  EmptyState,
  Eyebrow,
  Pill,
} from "@/components/ui";
import {
  OpenThreadRow,
  type AssignableRelationship,
} from "@/components/open-threads/OpenThreadRow";
import {
  SuggestedActionsSection,
  type CandidateRelationshipContext,
} from "./_SuggestedActionsSection";

type OriginFilter = "all" | CommitmentOrigin | "unset";
type StatusFilter = "all" | CommitmentCommunicationStatus;

export type { AssignableRelationship };

interface Props {
  initialCommitments: OpenThread[];
  assignableRelationships: AssignableRelationship[];
  initialSuggestedActions: PendingCandidateForUser[];
  relationshipsById: Record<string, CandidateRelationshipContext>;
}

export function CommitmentsView({
  initialCommitments,
  assignableRelationships,
  initialSuggestedActions,
  relationshipsById,
}: Props) {
  const deps = getBrowserDeps();
  const [commitments, setCommitments] = useState(initialCommitments);
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCommitments(initialCommitments);
  }, [initialCommitments]);

  // Re-render every minute so "days outstanding" rolls over without a refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    return commitments.filter((c) => {
      if (origin !== "all") {
        if (origin === "unset") {
          if (c.origin !== null) return false;
        } else if (c.origin !== origin) return false;
      }
      if (status !== "all" && c.communicationStatus !== status) return false;
      return true;
    });
  }, [commitments, origin, status]);

  function recompute(next: OpenThread[]) {
    setCommitments(next);
  }

  function replaceById(id: string, updated: OpenThread) {
    recompute(commitments.map((c) => (c.id === id ? updated : c)));
  }

  async function setRowMeta(id: string, meta: Parameters<typeof deps.openThreads.setCommitmentMeta>[1]) {
    const updated = await deps.openThreads.setCommitmentMeta(id, meta);
    replaceById(id, updated);
  }

  async function setRowRelationship(id: string, relationshipId: string) {
    const updated = await deps.openThreads.setOpenThreadRelationships(id, [
      relationshipId,
    ]);
    replaceById(id, updated);
  }

  async function closeRow(id: string) {
    await deps.openThreads.closeOpenThread(id);
    recompute(commitments.filter((c) => c.id !== id));
    setExpanded((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshCommitments() {
    const next = await deps.openThreads.listCommitmentsForUser();
    setCommitments(next);
  }

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Open threads I owe</Eyebrow>
          <Display className="mt-1">Commitments</Display>
          <p className="mt-2 max-w-prose text-[14px] leading-[22px] text-fg-muted">
            Things you owe someone. Click a row to add the context that makes
            following through easier — who it helps and why you&apos;re the
            right person to do it.
          </p>
        </div>
        <Link href="/commitments?new=1" scroll={false}>
          <Button variant="primary" leading={<Plus size={14} />}>
            Add
          </Button>
        </Link>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-8 xl:gap-12">
        <div className="order-2 min-w-0 flex-1 space-y-6 lg:order-1">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-divider py-3">
        <FilterGroup label="Origin">
          <Pill active={origin === "all"} onClick={() => setOrigin("all")}>
            All
          </Pill>
          <Pill
            active={origin === "asked_of_me"}
            onClick={() => setOrigin("asked_of_me")}
          >
            Asked of me
          </Pill>
          <Pill
            active={origin === "self_led"}
            onClick={() => setOrigin("self_led")}
          >
            Self-led
          </Pill>
          <Pill active={origin === "unset"} onClick={() => setOrigin("unset")}>
            Unset
          </Pill>
        </FilterGroup>

        <FilterGroup label="Status">
          <Pill active={status === "all"} onClick={() => setStatus("all")}>
            All
          </Pill>
          <Pill
            active={status === "not_communicated"}
            onClick={() => setStatus("not_communicated")}
          >
            Not communicated
          </Pill>
          <Pill
            active={status === "confirmed"}
            onClick={() => setStatus("confirmed")}
          >
            Confirmed
          </Pill>
        </FilterGroup>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={
            commitments.length === 0
              ? "No open commitments"
              : "No commitments match these filters"
          }
          description={
            commitments.length === 0
              ? "Add a commitment directly, or capture one from a relationship page or Agent Pass."
              : "Try clearing one of the filters above."
          }
          action={
            commitments.length === 0 ? (
              <Link href="/commitments?new=1" scroll={false}>
                <Button variant="primary" leading={<Plus size={14} />}>
                  Add commitment
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <OpenThreadRow
              key={c.id}
              variant="expandable"
              thread={c}
              expanded={expanded.has(c.id)}
              onToggleExpanded={() => toggleExpanded(c.id)}
              assignableRelationships={assignableRelationships}
              onSetCommitmentMeta={(meta) => setRowMeta(c.id, meta)}
              onSetRelationship={(relationshipId) =>
                setRowRelationship(c.id, relationshipId)
              }
              onClose={() => closeRow(c.id)}
            />
          ))}
        </ul>
      )}
        </div>

        <SuggestedActionsSection
          className="order-1 lg:order-2"
          initialPending={initialSuggestedActions}
          relationshipsById={relationshipsById}
          onCommitmentsChanged={refreshCommitments}
        />
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </span>
      {children}
    </div>
  );
}
