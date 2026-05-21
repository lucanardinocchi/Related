import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getServerDeps } from "@/lib/deps/server";
import { relationshipAnalytics } from "@related/shared";
import { GroupDetailView } from "./_GroupDetailView";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { groups, interactions, openThreads, relationships } =
    await getServerDeps();

  let group;
  try {
    group = await groups.getGroup(id);
  } catch {
    notFound();
  }

  // The Group-targeted Relationship is auto-paired by trigger; look it up to
  // anchor Open Threads queries to the Relationship id, not the Group id.
  const groupRels = await groups.listGroupRelationships();
  const rel = groupRels.find((r) => r.group.id === id);
  if (!rel) notFound();

  const [members, groupInteractions, threads, contactRelationships] =
    await Promise.all([
      groups.listMembers(id),
      interactions.listForGroup(id),
      openThreads.listOpenForRelationship(rel.id),
      relationships.listRelationships(),
    ]);

  const relationshipIdByContact = new Map(
    contactRelationships.map((r) => [r.contact.id, r.id]),
  );

  const analytics = relationshipAnalytics({
    interactions: groupInteractions,
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

      <GroupDetailView
        group={group}
        relationship={rel}
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          relationshipId: relationshipIdByContact.get(m.id) ?? null,
        }))}
        interactions={groupInteractions}
        openThreads={threads}
        analytics={analytics}
      />
    </div>
  );
}
