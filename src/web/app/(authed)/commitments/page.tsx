import { Suspense } from "react";
import { getServerDeps } from "@/lib/deps/server";
import { CommitmentsView } from "./_CommitmentsView";
import { NewCommitmentModal } from "./_NewCommitmentModal";
import type { CandidateRelationshipContext } from "./_SuggestedActionsSection";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const { openThreads, relationships, groups, candidates } = await getServerDeps();

  // Always scoped to direction=me_owes_them, closed_at IS NULL — the
  // Commitments view is by definition the User-owed bucket per the
  // src/shared/CONTEXT.md Open Thread glossary.
  const [commitments, contactRels, groupRels, suggestedActions] =
    await Promise.all([
      openThreads.listCommitmentsForUser(),
      relationships.listRelationships(),
      groups.listGroupRelationships(),
      candidates.listPendingForUser(),
    ]);
  // Flatten contact + group relationships into a single label-bearing list so
  // the reassign picker can show "Sam Chen" alongside "Climbing crew" without
  // the view needing to know about the polymorphism.
  const assignableRelationships = [
    ...contactRels.map((r) => ({
      id: r.id,
      label: r.contact.name,
      kind: "contact" as const,
    })),
    ...groupRels.map((r) => ({
      id: r.id,
      label: r.group.name,
      kind: "group" as const,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const relationshipsById: Record<string, CandidateRelationshipContext> = {};
  for (const r of contactRels) {
    relationshipsById[r.id] = {
      id: r.id,
      label: r.contact.name,
      phone: r.contact.phone,
      email: r.contact.email,
    };
  }
  for (const r of groupRels) {
    relationshipsById[r.id] = {
      id: r.id,
      label: r.group.name,
      phone: null,
      email: null,
    };
  }

  return (
    <>
      <CommitmentsView
        initialCommitments={commitments}
        assignableRelationships={assignableRelationships}
        initialSuggestedActions={suggestedActions}
        relationshipsById={relationshipsById}
      />
      <Suspense fallback={null}>
        <NewCommitmentModal
          assignableRelationships={assignableRelationships}
        />
      </Suspense>
    </>
  );
}
