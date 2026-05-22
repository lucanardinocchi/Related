"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  Group,
  GroupRelationship,
  Interaction,
  InteractionCategory,
  InteractionContact,
  InteractionStatus,
  OpenThread,
  Relationship,
  UpdateContactInput,
} from "@related/shared";
import {
  buildManualInteraction,
  buildManualOpenThread,
  sortInteractionsByTime,
  trimToNullable,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import type { ContactLocationValue } from "@/components/ui";
import type { AddContextResult } from "@/app/(authed)/relationships/[id]/_AddContextModal";
import type { GroupMemberSummary } from "@/app/(authed)/groups/[id]/_GroupMembersWidget";

type TimelineContextInput = {
  time: string;
  kind: string;
  category: InteractionCategory;
  notes: string | null;
  status: InteractionStatus;
};

export type ContactDetailMutationsInput = {
  target: "contact";
  relationship: Relationship;
  interactions: Interaction[];
  openThreads: OpenThread[];
};

export type GroupDetailMutationsInput = {
  target: "group";
  relationship: GroupRelationship;
  group: Group;
  members: GroupMemberSummary[];
  interactions: Interaction[];
  openThreads: OpenThread[];
};

export type RelationshipDetailMutationsInput =
  | ContactDetailMutationsInput
  | GroupDetailMutationsInput;

export type RelationshipDetailMutations = {
  relationship: Relationship | null;
  group: Group | null;
  members: GroupMemberSummary[];
  interactions: Interaction[];
  openThreads: OpenThread[];
  patchContactLocation: (next: ContactLocationValue) => Promise<void>;
  patchContactField: (
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
  ) => Promise<void>;
  patchContactPlatformId: (
    field:
      | "instagramScopedId"
      | "xUserId"
      | "whatsappWaId"
      | "tiktokOpenId",
    value: string,
  ) => Promise<void>;
  patchRelationshipMeta: (
    field: "role" | "cadence",
    next: string,
  ) => Promise<void>;
  patchGroupName: (next: string) => Promise<void>;
  patchGroupMemberField: (
    contactId: string,
    field: "phone" | "xUsername" | "tiktokUsername",
    next: string,
  ) => Promise<void>;
  patchGroupChannelId: (
    field: "xDmConversationId" | "whatsappGroupId" | "tiktokDmConversationId",
    value: string,
  ) => Promise<void>;
  addOpenThread: (description: string) => Promise<void>;
  patchOpenThreadDescription: (id: string, description: string) => Promise<void>;
  patchOpenThreadOrigin: (
    id: string,
    origin: CommitmentOrigin | "",
  ) => Promise<void>;
  patchOpenThreadStatus: (
    id: string,
    communicationStatus: CommitmentCommunicationStatus,
  ) => Promise<void>;
  closeOpenThread: (id: string) => Promise<void>;
  addTimelineContext: (input: TimelineContextInput) => Promise<void>;
  /** Unchanged modal orchestration until shared context-capture writer (#2) lands on main. */
  addContextFromModal: (result: AddContextResult) => Promise<void>;
  patchTimelineContext: (
    id: string,
    patch: Partial<TimelineContextInput>,
  ) => Promise<void>;
  deleteTimelineContext: (id: string) => Promise<void>;
};

function memberFieldValue(
  field: "phone" | "xUsername" | "tiktokUsername",
  next: string,
): string | null {
  const trimmed = next.trim();
  if (trimmed === "") return null;
  return field === "phone" ? trimmed : trimmed.replace(/^@/, "");
}

export function useRelationshipDetailMutations(
  input: RelationshipDetailMutationsInput,
): RelationshipDetailMutations {
  const deps = useMemo(() => getBrowserDeps(), []);

  const [relationship, setRelationship] = useState<Relationship | null>(
    input.target === "contact" ? input.relationship : null,
  );
  const [group, setGroup] = useState<Group | null>(
    input.target === "group" ? input.group : null,
  );
  const [members, setMembers] = useState<GroupMemberSummary[]>(
    input.target === "group" ? input.members : [],
  );
  const [interactions, setInteractions] = useState(input.interactions);
  const [openThreads, setOpenThreads] = useState(input.openThreads);

  const relationshipId = input.relationship.id;

  const timelineContacts: InteractionContact[] = useMemo(() => {
    if (input.target === "contact") {
      return [
        {
          id: input.relationship.contact.id,
          name: input.relationship.contact.name,
        },
      ];
    }
    return members.map((m) => ({ id: m.id, name: m.name }));
  }, [input, members]);

  const interactionLinkage = useMemo(() => {
    if (input.target === "contact") {
      return { contactIds: [input.relationship.contact.id] as string[] };
    }
    return {
      contactIds: members.map((m) => m.id),
      groupId: group!.id,
    };
  }, [input, members, group]);

  const patchContact = useCallback(
    async (contactId: string, patch: UpdateContactInput) => {
      const updated = await deps.relationships.updateContact(contactId, patch);
      if (input.target === "contact" && contactId === relationship!.contact.id) {
        setRelationship((r) => (r ? { ...r, contact: updated } : r));
      }
      if (input.target === "group") {
        setMembers((current) =>
          current.map((m) =>
            m.id === contactId
              ? {
                  ...m,
                  phone: updated.phone,
                  xUsername: updated.xUsername,
                  tiktokUsername: updated.tiktokUsername,
                }
              : m,
          ),
        );
      }
    },
    [deps.relationships, input.target, relationship],
  );

  const patchContactLocation = useCallback(
    async (next: ContactLocationValue) => {
      if (input.target !== "contact") return;
      await patchContact(relationship!.contact.id, {
        area: next.area,
        latitude: next.latitude,
        longitude: next.longitude,
      });
    },
    [input.target, patchContact, relationship],
  );

  const patchContactField = useCallback(
    async (
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
    ) => {
      if (input.target !== "contact") return;
      await patchContact(relationship!.contact.id, {
        [field]: trimToNullable(next),
      });
    },
    [input.target, patchContact, relationship],
  );

  const patchContactPlatformId = useCallback(
    async (
      field:
        | "instagramScopedId"
        | "xUserId"
        | "whatsappWaId"
        | "tiktokOpenId",
      value: string,
    ) => {
      if (input.target !== "contact") return;
      await patchContact(relationship!.contact.id, { [field]: value });
    },
    [input.target, patchContact, relationship],
  );

  const patchRelationshipMeta = useCallback(
    async (field: "role" | "cadence", next: string) => {
      if (input.target !== "contact") return;
      const updated = await deps.relationships.updateRelationship(
        relationship!.id,
        { [field]: trimToNullable(next) },
      );
      setRelationship(updated);
    },
    [deps.relationships, input.target, relationship],
  );

  const patchGroupName = useCallback(
    async (next: string) => {
      if (input.target !== "group" || !group) return;
      const trimmed = next.trim();
      if (trimmed === "" || trimmed === group.name) return;
      const updated = await deps.groups.updateGroup(group.id, { name: trimmed });
      setGroup(updated);
    },
    [deps.groups, group, input.target],
  );

  const patchGroupMemberField = useCallback(
    async (
      contactId: string,
      field: "phone" | "xUsername" | "tiktokUsername",
      next: string,
    ) => {
      if (input.target !== "group") return;
      await patchContact(contactId, {
        [field]: memberFieldValue(field, next),
      });
    },
    [input.target, patchContact],
  );

  const patchGroupChannelId = useCallback(
    async (
      field: "xDmConversationId" | "whatsappGroupId" | "tiktokDmConversationId",
      value: string,
    ) => {
      if (input.target !== "group" || !group) return;
      const updated = await deps.groups.updateGroup(group.id, { [field]: value });
      setGroup(updated);
    },
    [deps.groups, group, input.target],
  );

  const addOpenThread = useCallback(
    async (description: string) => {
      const id = await deps.openThreads.createOpenThread({
        description,
        direction: "me_owes_them",
        relationshipIds: [relationshipId],
      });
      const created = buildManualOpenThread(id, {
        description,
        relationshipIds: [relationshipId],
      });
      setOpenThreads((ts) => [...ts, created]);
    },
    [deps.openThreads, relationshipId],
  );

  const patchOpenThreadDescription = useCallback(
    async (id: string, description: string) => {
      const updated = await deps.openThreads.updateOpenThread(id, {
        description,
      });
      setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
    },
    [deps.openThreads],
  );

  const patchOpenThreadOrigin = useCallback(
    async (id: string, origin: CommitmentOrigin | "") => {
      const updated = await deps.openThreads.setCommitmentMeta(id, {
        origin: origin === "" ? null : origin,
      });
      setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
    },
    [deps.openThreads],
  );

  const patchOpenThreadStatus = useCallback(
    async (id: string, communicationStatus: CommitmentCommunicationStatus) => {
      const updated = await deps.openThreads.setCommitmentMeta(id, {
        communicationStatus,
      });
      setOpenThreads((ts) => ts.map((t) => (t.id === id ? updated : t)));
    },
    [deps.openThreads],
  );

  const closeOpenThread = useCallback(
    async (id: string) => {
      await deps.openThreads.closeOpenThread(id);
      setOpenThreads((ts) => ts.filter((t) => t.id !== id));
    },
    [deps.openThreads],
  );

  const addTimelineContext = useCallback(
    async (timelineInput: TimelineContextInput) => {
      const id = await deps.interactions.createInteraction({
        ...timelineInput,
        ...interactionLinkage,
      });
      const created = buildManualInteraction(
        id,
        timelineInput,
        timelineContacts,
      );
      setInteractions((xs) => sortInteractionsByTime([created, ...xs]));
    },
    [deps.interactions, interactionLinkage, timelineContacts],
  );

  const addContextFromModal = useCallback(
    async (result: AddContextResult) => {
      if (result.commitment) {
        const { description, timing } = result.commitment;
        if (timing === "planned") {
          await addOpenThread(description);
          return;
        }
        const status = timing === "completed" ? "occurred" : "missed";
        await addTimelineContext({
          time: result.time,
          kind: "commitment",
          category: "personal",
          notes: description,
          status,
        });
        return;
      }
      if (result.interaction) {
        await addTimelineContext({
          time: result.time,
          kind: result.interaction.kind,
          category: result.interaction.category,
          notes: result.notes,
          status: result.interaction.status,
        });
      }
    },
    [addOpenThread, addTimelineContext],
  );

  const patchTimelineContext = useCallback(
    async (id: string, patch: Partial<TimelineContextInput>) => {
      const updated = await deps.interactions.updateInteraction(id, patch);
      setInteractions((xs) =>
        sortInteractionsByTime(xs.map((i) => (i.id === id ? updated : i))),
      );
    },
    [deps.interactions],
  );

  const deleteTimelineContext = useCallback(
    async (id: string) => {
      await deps.interactions.deleteInteraction(id);
      setInteractions((xs) => xs.filter((i) => i.id !== id));
    },
    [deps.interactions],
  );

  const noop = async () => {};

  return {
    relationship,
    group,
    members,
    interactions,
    openThreads,
    patchContactLocation:
      input.target === "contact" ? patchContactLocation : noop,
    patchContactField: input.target === "contact" ? patchContactField : noop,
    patchContactPlatformId:
      input.target === "contact" ? patchContactPlatformId : noop,
    patchRelationshipMeta:
      input.target === "contact" ? patchRelationshipMeta : noop,
    patchGroupName: input.target === "group" ? patchGroupName : noop,
    patchGroupMemberField:
      input.target === "group" ? patchGroupMemberField : noop,
    patchGroupChannelId:
      input.target === "group" ? patchGroupChannelId : noop,
    addOpenThread,
    patchOpenThreadDescription,
    patchOpenThreadOrigin,
    patchOpenThreadStatus,
    closeOpenThread,
    addTimelineContext,
    addContextFromModal,
    patchTimelineContext,
    deleteTimelineContext,
  };
}
