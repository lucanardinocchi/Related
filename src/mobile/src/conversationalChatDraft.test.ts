import type { Relationship } from "@related/shared";
import { relationshipChatDraft } from "./conversationalChatDraft";

describe("relationshipChatDraft", () => {
  it("includes the contact name in a relationship-scoped starter prompt", () => {
    const relationship = {
      id: "r-1",
      contact: { id: "c-1", name: "Sam", phone: null, email: null },
    } as Relationship;

    expect(relationshipChatDraft(relationship)).toBe(
      "Help me think through my relationship with Sam",
    );
  });
});
