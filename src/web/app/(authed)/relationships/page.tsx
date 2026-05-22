import Link from "next/link";
import { Suspense } from "react";
import { User, Users, Plus } from "lucide-react";
import { getServerDeps } from "@/lib/deps/server";
import { NewRelationshipModal } from "./_NewRelationshipModal";
import { RelationshipsIndexCharts } from "./_RelationshipsIndexCharts";
import {
  Display,
  Body,
  Eyebrow,
  DataGrid,
  Mono,
  Button,
  EmptyState,
  AnalyticTile,
  AnalyticsRow,
  Badge,
} from "@/components/ui";
import type { DataGridColumn } from "@/components/ui";

export const dynamic = "force-dynamic";

interface RelationshipRow {
  id: string;
  href: string;
  name: string;
  kind: "individual" | "group";
  subtitle: string | null;
  lastSeenLabel: string;
}

function daysAgo(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const diff = Math.floor(
    (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff <= 0) return "today";
  if (diff === 1) return "1d ago";
  if (diff < 30) return `${diff}d ago`;
  const months = Math.floor(diff / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default async function RelationshipsIndexPage() {
  const {
    relationships,
    groups,
    interactions,
    openThreads,
    events,
    commsPlatformMessages,
  } = await getServerDeps();

  const [
    contactRels,
    groupRels,
    allInteractions,
    allOpenThreads,
    allThreads,
    platformComms,
    attendeeEvents,
  ] = await Promise.all([
    relationships.listRelationships(),
    groups.listGroupRelationships(),
    interactions.listAll(),
    openThreads.listOpenForUser(),
    openThreads.listAllForUser(),
    commsPlatformMessages.listForUser(),
    events.listForAttendeeCloseness(),
  ]);

  const now = new Date();

  // Index lastSeen per Contact and per Group via the embedded interactions.
  // Done client-side here (this is the server component) because the data is
  // already fetched and indexing it twice is cheaper than two more round-trips.
  const lastSeenByContact = new Map<string, string>();
  for (const i of allInteractions) {
    if (i.status !== "occurred") continue;
    for (const c of i.contacts) {
      const prev = lastSeenByContact.get(c.id);
      if (!prev || new Date(i.time) > new Date(prev)) {
        lastSeenByContact.set(c.id, i.time);
      }
    }
  }

  const contactOptions = contactRels
    .filter((relationship) => relationship.contact != null)
    .map((relationship) => ({
      id: relationship.contact.id,
      name: relationship.contact.name,
    }));

  const rows: RelationshipRow[] = [
    ...contactRels
      .filter((r) => r.contact != null)
      .map((r): RelationshipRow => ({
        id: r.id,
        href: `/relationships/${r.id}`,
        name: r.contact.name,
        kind: "individual",
        subtitle: r.role ?? null,
        lastSeenLabel: daysAgo(
          lastSeenByContact.get(r.contact.id) ?? null,
          now,
        ),
      })),
    ...groupRels
      .filter((r) => r.group != null)
      .map((r): RelationshipRow => ({
        id: r.id,
        href: `/groups/${r.group.id}`,
        name: r.group.name,
        kind: "group",
        subtitle: "Group",
        lastSeenLabel: "—",
      })),
  ];

  const openCommitmentCount = allOpenThreads.filter(
    (t) => t.direction === "me_owes_them" && t.closedAt === null,
  ).length;

  const peopleCreatedAts = contactRels
    .filter((r) => r.contact != null)
    .map((r) => r.contact.createdAt);

  const groupCreatedAts = groupRels
    .filter((r) => r.group != null)
    .map((r) => r.group.createdAt);

  const relationshipCreatedAtByContactId = Object.fromEntries(
    contactRels
      .filter((r) => r.contact != null)
      .map((r) => [r.contact.id, r.createdAt] as const),
  );

  const contactIdByRelationshipId = Object.fromEntries(
    contactRels
      .filter((r) => r.contact != null)
      .map((r) => [r.id, r.contact.id] as const),
  );

  const innerCircleContacts = contactRels
    .filter((r) => r.contact != null)
    .map((r) => ({
      contactId: r.contact.id,
      relationshipId: r.id,
      name: r.contact.name,
    }));

  const columns: DataGridColumn<RelationshipRow>[] = [
    {
      key: "name",
      header: "Name",
      width: "minmax(240px, 2fr)",
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.kind === "group" ? (
            <Users size={14} className="text-fg-subtle" />
          ) : (
            <User size={14} className="text-fg-subtle" />
          )}
          <span className="truncate">{row.name}</span>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      width: "120px",
      cell: (row) => (
        <Badge tone={row.kind === "group" ? "info" : "neutral"}>
          {row.kind === "group" ? "Group" : "Individual"}
        </Badge>
      ),
    },
    {
      key: "subtitle",
      header: "Role",
      width: "minmax(160px, 1fr)",
      cell: (row) => (
        <span className="truncate text-fg-muted">{row.subtitle ?? "—"}</span>
      ),
    },
    {
      key: "lastSeen",
      header: "Last seen",
      width: "120px",
      mono: true,
      align: "right",
      cell: (row) => row.lastSeenLabel,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>People & Groups</Eyebrow>
          <Display className="mt-1">Relationships</Display>
        </div>
        <Link href="/relationships?new=1" scroll={false}>
          <Button variant="primary" leading={<Plus size={14} />}>
            New
          </Button>
        </Link>
      </header>

      <AnalyticsRow>
        <AnalyticTile label="Total" value={<Mono>{rows.length}</Mono>} />
        <AnalyticTile
          label="Individuals"
          value={<Mono>{contactRels.length}</Mono>}
        />
        <AnalyticTile label="Groups" value={<Mono>{groupRels.length}</Mono>} />
        <AnalyticTile
          label="Open commitments"
          value={<Mono>{openCommitmentCount}</Mono>}
          hint={
            openCommitmentCount > 0 ? (
              <Link href="/commitments" className="hover:underline">
                View commitments →
              </Link>
            ) : null
          }
        />
      </AnalyticsRow>

      {(peopleCreatedAts.length > 0 ||
        groupCreatedAts.length > 0 ||
        allInteractions.length > 0 ||
        allThreads.length > 0 ||
        platformComms.length > 0 ||
        attendeeEvents.length > 0) && (
        <RelationshipsIndexCharts
          peopleCreatedAts={peopleCreatedAts}
          groupCreatedAts={groupCreatedAts}
          interactions={allInteractions}
          relationshipCreatedAtByContactId={
            relationshipCreatedAtByContactId
          }
          innerCircleContacts={innerCircleContacts}
          platformComms={platformComms}
          attendeeEvents={attendeeEvents}
          openThreads={allThreads}
          contactIdByRelationshipId={contactIdByRelationshipId}
        />
      )}

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => r.href}
        emptyState={
          <EmptyState
            title="No relationships yet"
            description="Add an individual contact or a group to start building your network."
            action={
              <Link href="/relationships?new=1" scroll={false}>
                <Button variant="primary" leading={<Plus size={14} />}>
                  New relationship
                </Button>
              </Link>
            }
          />
        }
      />

      {rows.length > 0 && (
        <Body className="text-fg-subtle">
          Tip — group memberships and rich profile fields live on each detail page.
        </Body>
      )}

      <Suspense fallback={null}>
        <NewRelationshipModal contacts={contactOptions} />
      </Suspense>
    </div>
  );
}
