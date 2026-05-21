"use client";

import { useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import type {
  Group,
  GroupRelationship,
  Interaction,
  OpenThread,
  RelationshipAnalytics,
  RelationshipContext,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  AnalyticTile,
  Badge,
  AnalyticsRow,
  Button,
  DataGrid,
  EmptyState,
  Eyebrow,
  H1,
  Mono,
  PropertyRow,
  Section,
  Textarea,
} from "@/components/ui";
import type { DataGridColumn } from "@/components/ui";

interface MemberSummary {
  id: string;
  name: string;
}

interface Props {
  group: Group;
  relationship: GroupRelationship;
  members: MemberSummary[];
  interactions: Interaction[];
  openThreads: OpenThread[];
  analytics: RelationshipAnalytics;
  /**
   * Per-Relationship narrative for this Group's Relationship — the
   * holistic "what's true about this Group" chunk written by the
   * Extraction Pass. Member-specific fan-out is on each member Contact's
   * own Relationship Context.
   */
  relationshipContext: RelationshipContext | null;
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

export function GroupDetailView({
  group: initialGroup,
  relationship,
  members,
  interactions,
  openThreads,
  analytics,
  relationshipContext: initialContext,
}: Props) {
  const deps = getBrowserDeps();
  const [group, setGroup] = useState(initialGroup);
  const [context, setContext] = useState(initialContext);
  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState(initialContext?.content ?? "");
  const [savingContext, setSavingContext] = useState(false);

  async function saveName(next: string) {
    const trimmed = next.trim();
    if (trimmed === "" || trimmed === group.name) return;
    const updated = await deps.groups.updateGroup(group.id, { name: trimmed });
    setGroup(updated);
  }

  async function saveContextDraft() {
    const trimmed = contextDraft.trim();
    setSavingContext(true);
    try {
      if (trimmed === "") {
        if (context) {
          await deps.relationshipContext.deleteForRelationship(relationship.id);
          setContext(null);
        }
      } else {
        const updated = await deps.relationshipContext.upsert(
          relationship.id,
          trimmed,
        );
        setContext(updated);
      }
      setEditingContext(false);
    } finally {
      setSavingContext(false);
    }
  }

  function cancelContextEdit() {
    setContextDraft(context?.content ?? "");
    setEditingContext(false);
  }

  const interactionColumns: DataGridColumn<Interaction>[] = [
    {
      key: "time",
      header: "When",
      width: "160px",
      mono: true,
      cell: (i) => fmtDateTime(i.time),
    },
    { key: "kind", header: "Kind", width: "120px", cell: (i) => i.kind },
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

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Group</Eyebrow>
        <H1 className="mt-1">{group.name}</H1>
      </header>

      <Section title="Key Details" fixed>
        <PropertyRow
          label="Name"
          value={group.name}
          onSave={saveName}
        />
        <PropertyRow
          label="Members"
          value={
            members.length === 0 ? (
              ""
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {members.map((m) => (
                  <Badge key={m.id} tone="neutral">
                    <User size={11} className="mr-1" />
                    {m.name}
                  </Badge>
                ))}
              </span>
            )
          }
          placeholder="No members yet"
        />
      </Section>

      <Section
        title="Relationship Context"
        meta={
          context
            ? `updated ${fmtDate(context.updatedAt)}`
            : undefined
        }
        actions={
          !editingContext ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setContextDraft(context?.content ?? "");
                setEditingContext(true);
              }}
            >
              {context ? "Edit" : "Add"}
            </Button>
          ) : undefined
        }
      >
        {editingContext ? (
          <div className="space-y-2">
            <Textarea
              value={contextDraft}
              onChange={(e) => setContextDraft(e.target.value)}
              rows={6}
              placeholder="What's currently true about this group as a whole? The Extraction Pass writes here after each Chat — member-specific notes live on each member's Relationship page."
              className="w-full"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={saveContextDraft}
                disabled={savingContext}
              >
                {savingContext ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelContextEdit}
                disabled={savingContext}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : context ? (
          <p className="whitespace-pre-wrap text-[14px] leading-[22px] text-fg">
            {context.content}
          </p>
        ) : (
          <EmptyState
            title="No Relationship Context yet"
            description="The Extraction Pass writes a holistic narrative for the group here after a Chat that mentions it. Member-specific fragments fan out to each member's own page."
          />
        )}
      </Section>

      <Section title="Analytics">
        <AnalyticsRow>
          <AnalyticTile
            label="Group interactions"
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
              description="Group-level threads (e.g. 'plan next college-friends dinner') appear here once captured."
            />
          }
        />
      </Section>

      <Section
        title="Full history"
        meta={`${interactions.length} group interaction${interactions.length === 1 ? "" : "s"}`}
        defaultCollapsed={interactions.length > 10}
      >
        <DataGrid
          columns={interactionColumns}
          rows={interactions}
          rowKey={(i) => i.id}
          emptyState={
            <EmptyState
              title="No group interactions yet"
              description="Only group-mode Interactions show here. 1:1 catch-ups with a member appear on that member's page."
            />
          }
        />
      </Section>
    </div>
  );
}
