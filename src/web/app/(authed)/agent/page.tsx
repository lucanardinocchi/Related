import { getServerDeps } from "@/lib/deps/server";
import { AgentView } from "./_AgentView";

export const dynamic = "force-dynamic";

/**
 * /agent — Conversational Intelligence surface (per ADR-0009).
 *
 * Server-renders the initial chat list; everything interactive (selecting
 * a chat, composing, sending) lives in the client AgentView. PR 1 ships
 * the shell only — the `chat-respond` Edge Function that produces
 * assistant turns lands in PR 2; Extraction Pass on close lands in PR 3.
 *
 * The legacy /talk redirect to /agent is unchanged. The Engaged Pass
 * surface (Relationship-scoped voice) is *not* retired by this ADR — it
 * continues to fire when the User starts a voice session focused on a
 * single Relationship. ADR-0008's framing is amended: /agent is the
 * Conversational surface, Engaged Pass remains a Pass tier.
 */
export default async function AgentPage() {
  const { chats } = await getServerDeps();
  const initialChats = await chats.listChats();

  return <AgentView initialChats={initialChats} />;
}
