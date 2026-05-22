import type { ChatSummary } from "./ChatsClient";

/** Client-side filter for the agent chat list rail (Conversational + Pocket). */
export function filterChatSummaries(
  chats: ChatSummary[],
  query: string,
): ChatSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return chats;

  return chats.filter((chat) => {
    const title = (chat.title ?? "untitled chat").toLowerCase();
    const preview = (chat.lastMessagePreview ?? "").toLowerCase();
    const sourceLabel = chat.source === "pocket" ? "pocket" : "";
    return (
      title.includes(q) || preview.includes(q) || sourceLabel.includes(q)
    );
  });
}
