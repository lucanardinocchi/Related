"use client";

import { useState } from "react";
import type {
  Group,
  GroupRelationship,
  Interaction,
  InteractionCategory,
  InteractionStatus,
  OpenThread,
  RelationshipAnalytics,
  CommitmentCommunicationStatus,
  CommitmentOrigin,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Eyebrow, H1 } from "@/components/ui";
import { TouchpointsChart } from "../../relationships/[id]/_TouchpointsChart";
import { OpenThreadsSection } from "../../relationships/[id]/_OpenThreadsSection";
import { ContextTimelineSection } from "../../relationships/[id]/_ContextTimelineSection";
import { RelationshipAnalyticsSection } from "../../relationships/[id]/_RelationshipAnalyticsSection";
import { GroupKeyDetailsSection } from "./_GroupKeyDetailsSection";
import type { GroupMemberSummary } from "./_GroupMembersWidget";

interface Props {
  group: Group;
  relationship: GroupRelationship;
  members: GroupMemberSummary[];
  interactions: Interaction[];
  openThreads: OpenThread[];
  analytics: RelationshipAnalytics;
}

export function GroupDetailView({
  group: initialGroup,
  relationship,
  members,
  interactions: initialInteractions,
  openThreads: initialOpenThreads,
  analytics,
}: Props) {
  const deps = getBrowserDeps();
  const [group, setGroup] = useState(initialGroup);
  const [interactions, setInteractions] = useState<Interaction[]>(
    initialInteractions,
  );
  const [openThreads, setOpenThreads] = useState<OpenThread[]>(
    initialOpenThreads,
  );

  async function saveName(next: string) {
    const trimmed = next.trim();
    if (trimmed === "" || trimmed === group.name) return;
    const updated = await deps.groups.updateGroup(group.id, { name: trimmed });
    setGroup(updated);
  }

  async function addThread(description: string): Promise<void> {
    const id = await deps.openThreads.createOpenThread({
      description,
      direction: "me_owes_them",
      relationshipIds: [relationship.id],
    });
    const created: OpenThread = {
      id,
      description,
      direction: "me_owes_them",
      origin: null,
      communicationStatus: "not_communicated",
      createdAt: new Date().toISOString(),
      closedAt: null,
      relationshipIds: [relationship.id],
      whyHelpsPerson: null,
      whyICanHelp: null,
    };
    setOpenThreads((ts) => [...ts, created]);
  }

  async function patchThreadDescription(id: string, description: string) {
    const updated = await deps.openThreads.updateOpenThread(id, {
      description,
    });
    setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
  }

  async function patchThreadOrigin(
    id: string,
    origin: CommitmentOrigin | "",
  ) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      origin: origin === "" ? null : origin,
    });
    setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
  }

  async function patchThreadStatus(
    id: string,
    communicationStatus: CommitmentCommunicationStatus,
  ) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      communicationStatus,
    });
    setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
  }

  async function closeThread(id: string) {
    await deps.openThreads.closeOpenThread(id);
    setOpenThreads((ts) => ts.filter((t) => t.id !== id));
  }

  async function addContext(input: {
    time: string;
    kind: string;
    category: InteractionCategory;
    notes: string | null;
    status: InteractionStatus;
  }): Promise<void> {
    const id = await deps.interactions.createInteraction({
      ...input,
      contactIds: members.map((m) => m.id),
      groupId: group.id,
    });
    const created: Interaction = {
      id,
      time: input.time,
      kind: input.kind,
      category: input.category,
      notes: input.notes,
      status: input.status,
      contacts: members.map((m) => ({ id: m.id, name: m.name })),
    };
    setInteractions((xs) =>
      [created, ...xs].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      ),
    );
  }

  async function patchContext(
    id: string,
    patch: Partial<{
      time: string;
      kind: string;
      category: InteractionCategory;
      notes: string | null;
      status: InteractionStatus;
    }>,
  ) {
    const updated = await deps.interactions.updateInteraction(id, patch);
    setInteractions((xs) =>
      xs
        .map((i) => (i.id === id ? updated : i))
        .sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
        ),
    );
  }

  async function deleteContext(id: string) {
    await deps.interactions.deleteInteraction(id);
    setInteractions((xs) => xs.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Group</Eyebrow>
        <H1 className="mt-1">{group.name}</H1>
      </header>

      <TouchpointsChart
        interactions={interactions}
        openThreads={openThreads}
      />

      <GroupKeyDetailsSection
        name={group.name}
        members={members}
        onSaveName={saveName}
      />

      <RelationshipAnalyticsSection analytics={analytics} />

      <OpenThreadsSection
        threads={openThreads}
        onAdd={addThread}
        onEditDescription={patchThreadDescription}
        onSetOrigin={patchThreadOrigin}
        onSetStatus={patchThreadStatus}
        onClose={closeThread}
      />

      <ContextTimelineSection
        interactions={interactions}
        onAdd={addContext}
        onEdit={patchContext}
        onDelete={deleteContext}
      />
    </div>
  );
}
