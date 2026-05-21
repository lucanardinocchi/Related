"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type {
  Interaction,
  OpenThread,
  Relationship,
  RelationshipAnalytics,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Badge,
  AnalyticsRow,
  AnalyticTile,
  DataGrid,
  EmptyState,
  Eyebrow,
  H1,
  Mono,
  PropertyRow,
  Section,
} from "@/components/ui";
import type { DataGridColumn } from "@/components/ui";

interface GroupSummary {
  id: string;
  name: string;
  /** The auto-paired Group-targeted Relationship id, used for routing. */
  relationshipId: string;
}

interface Props {
  relationship: Relationship;
  interactions: Interaction[];
  openThreads: OpenThread[];
  groupMemberships: GroupSummary[];
  analytics: RelationshipAnalytics;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RelationshipDetailView({
  relationship: initialRelationship,
  interactions,
  openThreads,
  groupMemberships,
  analytics,
}: Props) {
  const deps = getBrowserDeps();
  const [relationship, setRelationship] = useState(initialRelationship);

  async function saveContact(
    field: "name" | "phone" | "email" | "birthday" | "area" | "occupation" | "education",
    next: string,
  ) {
    const value = next.trim() === "" ? null : next.trim();
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { [field]: value },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveRelationship(field: "role" | "cadence", next: string) {
    const value = next.trim() === "" ? null : next.trim();
    const updated = await deps.relationships.updateRelationship(
      relationship.id,
      { [field]: value },
    );
    setRelationship(updated);
  }

  const interactionColumns: DataGridColumn<Interaction>[] = [
    {
      key: "time",
      header: "When",
      width: "160px",
      mono: true,
      cell: (i) => fmtDateTime(i.time),
    },
    {
      key: "kind",
      header: "Kind",
      width: "120px",
      cell: (i) => i.kind,
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      cell: (i) => (
        <Badge
          tone={
            i.status === "occurred"
              ? "approved"
              : i.status === "planned"
                ? "sent"
                : "lost"
          }
        >
          {i.status}
        </Badge>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      width: "minmax(200px, 1fr)",
      cell: (i) => (
        <span className="truncate text-fg-muted">{i.notes ?? "—"}</span>
      ),
    },
  ];

  const threadColumns: DataGridColumn<OpenThread>[] = [
    {
      key: "description",
      header: "What",
      width: "minmax(200px, 1fr)",
      cell: (t) => t.description,
    },
    {
      key: "direction",
      header: "Direction",
      width: "160px",
      cell: (t) => (
        <Badge tone={t.direction === "me_owes_them" ? "warning" : "info"}>
          {t.direction === "me_owes_them" ? "I owe them" : "They owe me"}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Created",
      width: "140px",
      mono: true,
      align: "right",
      cell: (t) => fmtDate(t.createdAt),
    },
  ];

  const recent = interactions.slice(0, 3);

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Relationship</Eyebrow>
        <H1 className="mt-1">{relationship.contact.name}</H1>
      </header>

      <Section title="Key Details" fixed>
        <PropertyRow
          label="Name"
          value={relationship.contact.name}
          onSave={(v) => saveContact("name", v)}
        />
        <PropertyRow
          label="Role"
          value={relationship.role ?? ""}
          placeholder="e.g. close friend"
          onSave={(v) => saveRelationship("role", v)}
        />
        <PropertyRow
          label="Cadence"
          value={relationship.cadence ?? ""}
          placeholder="e.g. every couple of weeks"
          onSave={(v) => saveRelationship("cadence", v)}
        />
        <PropertyRow
          label="Phone"
          value={relationship.contact.phone ?? ""}
          placeholder="Add a phone number"
          onSave={(v) => saveContact("phone", v)}
        />
        <PropertyRow
          label="Email"
          value={relationship.contact.email ?? ""}
          placeholder="Add an email"
          onSave={(v) => saveContact("email", v)}
        />
        <PropertyRow
          label="Birthday"
          value={
            relationship.contact.birthday
              ? <Mono>{relationship.contact.birthday}</Mono>
              : ""
          }
          editValue={relationship.contact.birthday ?? ""}
          placeholder="YYYY-MM-DD"
          onSave={(v) => saveContact("birthday", v)}
        />
        <PropertyRow
          label="Area"
          value={relationship.contact.area ?? ""}
          placeholder="e.g. Surry Hills"
          onSave={(v) => saveContact("area", v)}
        />
        <PropertyRow
          label="Occupation"
          value={relationship.contact.occupation ?? ""}
          placeholder="e.g. product designer"
          onSave={(v) => saveContact("occupation", v)}
        />
        <PropertyRow
          label="Education"
          value={relationship.contact.education ?? ""}
          placeholder="e.g. UNSW, BSc"
          onSave={(v) => saveContact("education", v)}
        />
        <PropertyRow
          label="Groups"
          value={
            groupMemberships.length === 0 ? (
              ""
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {groupMemberships.map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/${g.id}`}
                    className="inline-flex"
                  >
                    <Badge tone="info">
                      <Users size={11} className="mr-1" />
                      {g.name}
                    </Badge>
                  </Link>
                ))}
              </span>
            )
          }
          placeholder="No groups yet"
        />
      </Section>

      <Section title="Recent Context" meta={`${recent.length} of ${interactions.length}`}>
        {recent.length === 0 ? (
          <EmptyState
            title="No recent context"
            description="Log an Interaction with this person to start building a thread."
          />
        ) : (
          <ul className="space-y-2">
            {recent.map((i) => (
              <li
                key={i.id}
                className="rounded-md border border-divider p-3 text-[14px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-fg">{i.kind}</span>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] tabular-nums text-fg-muted">
                    {fmtDateTime(i.time)}
                  </span>
                </div>
                {i.notes && (
                  <div className="mt-1 text-fg-muted">{i.notes}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Analytics">
        <AnalyticsRow>
          <AnalyticTile
            label="Interactions"
            value={<Mono>{analytics.totalInteractions}</Mono>}
          />
          <AnalyticTile
            label="Last 30 days"
            value={<Mono>{analytics.interactionsLast30Days}</Mono>}
          />
          <AnalyticTile
            label="Days since last"
            value={
              <Mono>
                {analytics.daysSinceLastInteraction === null
                  ? "—"
                  : analytics.daysSinceLastInteraction}
              </Mono>
            }
            hint={
              analytics.lastInteractionAt
                ? `last seen ${fmtDate(analytics.lastInteractionAt)}`
                : undefined
            }
          />
          <AnalyticTile
            label="Open commitments"
            value={<Mono>{analytics.openCommitments}</Mono>}
          />
        </AnalyticsRow>
      </Section>

      <Section title="Open threads" defaultCollapsed={openThreads.length === 0}>
        <DataGrid
          columns={threadColumns}
          rows={openThreads}
          rowKey={(t) => t.id}
          emptyState={
            <EmptyState
              title="No open threads"
              description="Threads are the agent's working memory of what's outstanding with this person."
            />
          }
        />
      </Section>

      <Section
        title="Full history"
        meta={`${interactions.length} interaction${interactions.length === 1 ? "" : "s"}`}
        defaultCollapsed={interactions.length > 10}
      >
        <DataGrid
          columns={interactionColumns}
          rows={interactions}
          rowKey={(i) => i.id}
          emptyState={
            <EmptyState
              title="No interactions logged yet"
              description="Catch-ups, calls, dinners — everything you've done together appears here once logged."
            />
          }
        />
      </Section>
    </div>
  );
}
