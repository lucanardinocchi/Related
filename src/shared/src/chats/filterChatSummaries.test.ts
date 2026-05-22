import type { ChatSummary } from "./ChatsClient";
import { filterChatSummaries } from "./filterChatSummaries";

function summary(over: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "c-1",
    title: "Coffee with Sam",
    source: "conversational",
    createdAt: "2026-05-21T10:00:00Z",
    closedAt: null,
    extractedAt: null,
    lastMessagePreview: "Let's catch up next week",
    lastMessageAt: "2026-05-21T10:01:00Z",
    messageCount: 2,
    ...over,
  };
}

describe("filterChatSummaries", () => {
  it("returns all chats when query is empty", () => {
    const chats = [summary(), summary({ id: "c-2", title: "Other" })];
    expect(filterChatSummaries(chats, "")).toEqual(chats);
    expect(filterChatSummaries(chats, "   ")).toEqual(chats);
  });

  it("matches title and preview case-insensitively", () => {
    const chats = [
      summary(),
      summary({
        id: "c-2",
        title: "Budget review",
        lastMessagePreview: "Pocket transcript imported",
      }),
    ];
    expect(filterChatSummaries(chats, "coffee")).toHaveLength(1);
    expect(filterChatSummaries(chats, "CATCH UP")).toHaveLength(1);
    expect(filterChatSummaries(chats, "budget")).toHaveLength(1);
    expect(filterChatSummaries(chats, "transcript")).toHaveLength(1);
  });

  it("matches pocket source label", () => {
    const chats = [
      summary({ id: "c-1", source: "conversational" }),
      summary({
        id: "c-2",
        title: "Walk notes",
        source: "pocket",
        lastMessagePreview: null,
      }),
    ];
    expect(filterChatSummaries(chats, "pocket")).toHaveLength(1);
    expect(filterChatSummaries(chats, "pocket")[0]?.id).toBe("c-2");
  });

  it("matches untitled chats by fallback label", () => {
    const chats = [summary({ title: null })];
    expect(filterChatSummaries(chats, "untitled")).toHaveLength(1);
  });
});
