import { renderContextBlock } from "./prompt";
import type { ConversationContextSnapshot } from "./types";

describe("renderContextBlock", () => {
  it("renders an empty world with placeholder sections", () => {
    const snapshot: ConversationContextSnapshot = {
      asOf: "2026-05-22T12:00:00.000Z",
      relationships: [],
      relationshipsTotal: 0,
      groups: [],
      userContext: {
        goalsAndValues: [],
        situationalState: null,
        recentTransientIntent: [],
      },
      openThreads: [],
      openThreadsTotal: 0,
      recentInteractions: [],
      recentInteractionsTotal: 0,
    };

    const block = renderContextBlock(snapshot);
    expect(block).toContain('<user_world as_of="2026-05-22T12:00:00.000Z">');
    expect(block).toContain("(no relationships yet)");
    expect(block).toContain("(no open threads)");
    expect(block).toContain("(no Interactions in the last 30 days)");
  });

  it("includes relationship and open-thread summaries", () => {
    const snapshot: ConversationContextSnapshot = {
      asOf: "2026-05-22T12:00:00.000Z",
      relationships: [
        {
          id: "rel-1",
          target_type: "contact",
          role: "friend",
          cadence: "weekly",
          name: "Sam Patel",
        },
      ],
      relationshipsTotal: 1,
      groups: [{ id: "grp-1", name: "Work", member_count: 3 }],
      userContext: {
        goalsAndValues: ["Stay close to family"],
        situationalState: "Busy week at work.",
        recentTransientIntent: [],
      },
      openThreads: [
        {
          id: "thread-1",
          description: "Reply about dinner",
          direction: "me_owes_them",
          days_outstanding: 4,
          relationship_ids: ["rel-1"],
        },
      ],
      openThreadsTotal: 1,
      recentInteractions: [],
      recentInteractionsTotal: 0,
    };

    const block = renderContextBlock(snapshot);
    expect(block).toContain("Sam Patel");
    expect(block).toContain("Reply about dinner");
    expect(block).toContain("Stay close to family");
    expect(block).toContain("Busy week at work.");
  });
});
