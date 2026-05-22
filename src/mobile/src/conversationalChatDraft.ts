import type { Relationship } from "@related/shared";

/** Starter prompt when redirecting voice/text from a Relationship surface. */
export function relationshipChatDraft(relationship: Relationship): string {
  return `Help me think through my relationship with ${relationship.contact.name}`;
}
