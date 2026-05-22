"use client";

import type {
  Group,
  GroupRelationship,
  Interaction,
  OpenThread,
  RelationshipAnalytics,
} from "@related/shared";
import { Eyebrow, H1 } from "@/components/ui";
import { useRelationshipDetailMutations } from "@/hooks/useRelationshipDetailMutations";
import { TouchpointsChart } from "../../relationships/[id]/_TouchpointsChart";
import { OpenThreadsSection } from "../../relationships/[id]/_OpenThreadsSection";
import { ContextTimelineSection } from "../../relationships/[id]/_ContextTimelineSection";
import { RelationshipAnalyticsSection } from "../../relationships/[id]/_RelationshipAnalyticsSection";
import { GroupKeyDetailsSection } from "./_GroupKeyDetailsSection";
import { GroupCommsSection } from "./_GroupCommsSection";
import { GroupEventsSection } from "./_GroupEventsSection";
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
  members: initialMembers,
  interactions: initialInteractions,
  openThreads: initialOpenThreads,
  analytics,
}: Props) {
  const m = useRelationshipDetailMutations({
    target: "group",
    relationship,
    group: initialGroup,
    members: initialMembers,
    interactions: initialInteractions,
    openThreads: initialOpenThreads,
  });

  const group = m.group!;

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Group</Eyebrow>
        <H1 className="mt-1">{group.name}</H1>
      </header>

      <TouchpointsChart
        interactions={m.interactions}
        openThreads={m.openThreads}
      />

      <GroupKeyDetailsSection
        name={group.name}
        members={m.members}
        memberMessaging={m.members.map((member) => ({
          id: member.id,
          name: member.name,
          relationshipId: member.relationshipId,
          phone: member.phone,
          xUsername: member.xUsername ?? null,
          tiktokUsername: member.tiktokUsername ?? null,
        }))}
        onSaveName={m.patchGroupName}
        onSaveMember={m.patchGroupMemberField}
      />

      <GroupCommsSection
        groupId={group.id}
        groupName={group.name}
        members={m.members.map((member) => ({
          id: member.id,
          name: member.name,
          phone: member.phone,
          xUsername: member.xUsername ?? null,
          xUserId: member.xUserId ?? null,
          tiktokUsername: member.tiktokUsername ?? null,
          tiktokOpenId: member.tiktokOpenId ?? null,
        }))}
        xDmConversationId={group.xDmConversationId}
        whatsappGroupId={group.whatsappGroupId}
        tiktokDmConversationId={group.tiktokDmConversationId}
        onXConversationIdResolved={(id) =>
          m.patchGroupChannelId("xDmConversationId", id)
        }
        onWhatsAppGroupIdResolved={(id) =>
          m.patchGroupChannelId("whatsappGroupId", id)
        }
        onTikTokConversationIdResolved={(id) =>
          m.patchGroupChannelId("tiktokDmConversationId", id)
        }
      />

      <GroupEventsSection
        groupName={group.name}
        groupMemberIds={m.members.map((member) => member.id)}
      />

      <RelationshipAnalyticsSection analytics={analytics} />

      <OpenThreadsSection
        threads={m.openThreads}
        onAdd={m.addOpenThread}
        onEditDescription={m.patchOpenThreadDescription}
        onSetOrigin={m.patchOpenThreadOrigin}
        onSetStatus={m.patchOpenThreadStatus}
        onClose={m.closeOpenThread}
      />

      <ContextTimelineSection
        interactions={m.interactions}
        openThreads={m.openThreads}
        onAdd={m.addTimelineContext}
        onAddFromModal={m.addContextFromModal}
        onEdit={m.patchTimelineContext}
        onDelete={m.deleteTimelineContext}
      />
    </div>
  );
}
