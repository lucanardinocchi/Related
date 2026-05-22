"use client";

import type { Interaction, OpenThread, Relationship } from "@related/shared";
import { Eyebrow, H1 } from "@/components/ui";
import { useRelationshipDetailMutations } from "@/hooks/useRelationshipDetailMutations";
import { TouchpointsChart } from "./_TouchpointsChart";
import { KeyDetailsSection, type GroupSummary } from "./_KeyDetailsSection";
import { OpenThreadsSection } from "./_OpenThreadsSection";
import { ContextTimelineSection } from "./_ContextTimelineSection";
import { CommsSection } from "./_CommsSection";

interface Props {
  relationship: Relationship;
  interactions: Interaction[];
  openThreads: OpenThread[];
  groupMemberships: GroupSummary[];
}

export function RelationshipDetailView({
  relationship: initialRelationship,
  interactions: initialInteractions,
  openThreads: initialOpenThreads,
  groupMemberships,
}: Props) {
  const m = useRelationshipDetailMutations({
    target: "contact",
    relationship: initialRelationship,
    interactions: initialInteractions,
    openThreads: initialOpenThreads,
  });

  const relationship = m.relationship!;

  return (
    <div className="space-y-2">
      <header className="mt-2 pb-4">
        <Eyebrow>Relationship</Eyebrow>
        <H1 className="mt-1">{relationship.contact.name}</H1>
      </header>

      <TouchpointsChart
        interactions={m.interactions}
        openThreads={m.openThreads}
      />

      <KeyDetailsSection
        relationship={relationship}
        groupMemberships={groupMemberships}
        onSaveContact={m.patchContactField}
        onSaveLocation={m.patchContactLocation}
        onSaveRelationship={m.patchRelationshipMeta}
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
        onInstagramScopedIdResolved={(id) =>
          m.patchContactPlatformId("instagramScopedId", id)
        }
        onXUserIdResolved={(id) => m.patchContactPlatformId("xUserId", id)}
        onWhatsappWaIdResolved={(id) =>
          m.patchContactPlatformId("whatsappWaId", id)
        }
        onTikTokOpenIdResolved={(id) =>
          m.patchContactPlatformId("tiktokOpenId", id)
        }
      />

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
