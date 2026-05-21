import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getServerDeps } from "@/lib/deps/server";
import { relationshipAnalytics } from "@related/shared";
import { RelationshipDetailView } from "./_RelationshipDetailView";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
}

export default async function RelationshipDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const { relationships, interactions, openThreads, groups } =
    await getServerDeps();

  let relationship;
  try {
    relationship = await relationships.getRelationship(id);
  } catch {
    notFound();
  }

  const [interactionHistory, threads, groupMemberships] = await Promise.all([
    interactions.listForContact(relationship.contact.id),
    openThreads.listOpenForRelationship(relationship.id),
    groups.listForContact(relationship.contact.id),
  ]);

  const analytics = relationshipAnalytics({
    interactions: interactionHistory,
    openThreads: threads,
  });

  return (
    <div className="space-y-2">
      <Link
        href="/relationships"
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-fg-muted hover:bg-hover hover:text-fg"
      >
        <ChevronLeft size={14} /> All relationships
      </Link>

      <RelationshipDetailView
        relationship={relationship}
        interactions={interactionHistory}
        openThreads={threads}
        groupMemberships={groupMemberships.map((g) => ({
          id: g.group.id,
          name: g.group.name,
          relationshipId: g.id,
        }))}
        analytics={analytics}
      />
    </div>
  );
}
