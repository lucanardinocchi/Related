import { Suspense } from "react";
import { getServerDeps } from "@/lib/deps/server";
import { CommitmentsView } from "./_CommitmentsView";
import { NewCommitmentModal } from "./_NewCommitmentModal";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const { openThreads, relationships, groups } = await getServerDeps();

  // Always scoped to direction=me_owes_them, closed_at IS NULL — the
  // Commitments view is by definition the User-owed bucket per the
  // src/shared/CONTEXT.md Open Thread glossary.
  const [commitments, contactRels, groupRels] = await Promise.all([
    openThreads.listCommitmentsForUser(),
    relationships.listRelationships(),
    groups.listGroupRelationships(),
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

  return (
    <>
      <CommitmentsView
        initialCommitments={commitments}
        assignableRelationships={assignableRelationships}
      />
      <Suspense fallback={null}>
        <NewCommitmentModal
          assignableRelationships={assignableRelationships}
        />
      </Suspense>
    </>
  );
}
