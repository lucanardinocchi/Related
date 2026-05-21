"use client";

import { useState } from "react";
import type {
  CandidateSet,
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  Interaction,
  InteractionCategory,
  InteractionStatus,
  OpenThread,
  Relationship,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Eyebrow, H1 } from "@/components/ui";
import type { ContactLocationValue } from "@/components/ui";
import { TouchpointsChart } from "./_TouchpointsChart";
import { KeyDetailsSection, type GroupSummary } from "./_KeyDetailsSection";
import { OpenThreadsSection } from "./_OpenThreadsSection";
import { ContextTimelineSection } from "./_ContextTimelineSection";
import type { AddContextResult } from "./_AddContextModal";
import { RecentCandidateSection } from "./_RecentCandidateSection";
import { CommsSection } from "./_CommsSection";

interface Props {
  relationship: Relationship;
  interactions: Interaction[];
  openThreads: OpenThread[];
  groupMemberships: GroupSummary[];
  latestCandidateSet: CandidateSet | null;
}

export function RelationshipDetailView({
  relationship: initialRelationship,
  interactions: initialInteractions,
  openThreads: initialOpenThreads,
  groupMemberships,
  latestCandidateSet,
}: Props) {
  const deps = getBrowserDeps();
  const [relationship, setRelationship] = useState(initialRelationship);
  const [interactions, setInteractions] = useState<Interaction[]>(
    initialInteractions,
  );
  const [openThreads, setOpenThreads] = useState<OpenThread[]>(
    initialOpenThreads,
  );

  async function saveLocation(next: ContactLocationValue) {
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      {
        area: next.area,
        latitude: next.latitude,
        longitude: next.longitude,
      },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveContact(
    field:
      | "name"
      | "phone"
      | "email"
      | "birthday"
      | "occupation"
      | "education"
      | "instagramUsername"
      | "xUsername"
      | "tiktokUsername",
    next: string,
  ) {
    const value = next.trim() === "" ? null : next.trim();
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { [field]: value },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveInstagramScopedId(scopedId: string) {
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { instagramScopedId: scopedId },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveXUserId(userId: string) {
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { xUserId: userId },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveWhatsappWaId(waId: string) {
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { whatsappWaId: waId },
    );
    setRelationship((r) => ({ ...r, contact: updated }));
  }

  async function saveTikTokOpenId(openId: string) {
    const updated = await deps.relationships.updateContact(
      relationship.contact.id,
      { tiktokOpenId: openId },
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
      contactIds: [relationship.contact.id],
    });
    const created: Interaction = {
      id,
      time: input.time,
      kind: input.kind,
      category: input.category,
      notes: input.notes,
      status: input.status,
      contacts: [
        { id: relationship.contact.id, name: relationship.contact.name },
      ],
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

  async function addContextFromModal(result: AddContextResult): Promise<void> {
    if (result.commitment) {
      const { description, timing } = result.commitment;
      if (timing === "planned") {
        await addThread(description);
        return;
      }
      const status = timing === "completed" ? "occurred" : "missed";
      await addContext({
        time: result.time,
        kind: "commitment",
        category: "personal",
        notes: description,
        status,
      });
      return;
    }
    if (result.interaction) {
      await addContext({
        time: result.time,
        kind: result.interaction.kind,
        category: result.interaction.category,
        notes: result.notes,
        status: result.interaction.status,
      });
    }
  }

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Relationship</Eyebrow>
        <H1 className="mt-1">{relationship.contact.name}</H1>
      </header>

      <TouchpointsChart
        interactions={interactions}
        openThreads={openThreads}
      />

      <KeyDetailsSection
        relationship={relationship}
        groupMemberships={groupMemberships}
        onSaveContact={saveContact}
        onSaveLocation={saveLocation}
        onSaveRelationship={saveRelationship}
      />

      <CommsSection
        contact={{
          id: relationship.contact.id,
          name: relationship.contact.name,
          phone: relationship.contact.phone,
          email: relationship.contact.email,
          instagramUsername: relationship.contact.instagramUsername,
          instagramScopedId: relationship.contact.instagramScopedId,
          xUsername: relationship.contact.xUsername,
          xUserId: relationship.contact.xUserId,
          tiktokUsername: relationship.contact.tiktokUsername,
          tiktokOpenId: relationship.contact.tiktokOpenId,
          whatsappWaId: relationship.contact.whatsappWaId,
        }}
        onInstagramScopedIdResolved={saveInstagramScopedId}
        onXUserIdResolved={saveXUserId}
        onWhatsappWaIdResolved={saveWhatsappWaId}
        onTikTokOpenIdResolved={saveTikTokOpenId}
      />

      {latestCandidateSet ? (
        <RecentCandidateSection candidateSet={latestCandidateSet} />
      ) : null}

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
        openThreads={openThreads}
        onAdd={addContext}
        onAddFromModal={addContextFromModal}
        onEdit={patchContext}
        onDelete={deleteContext}
      />
    </div>
  );
}
