import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import type {
  ChatRow,
  MessageRow,
  RelationshipDirectoryEntry,
  ResolvedRelationship,
} from "./types.ts";

const RELATIONSHIP_CAP = 200;
const RECENT_INTERACTION_CAP = 40;
const OPEN_THREAD_CAP = 30;

export async function loadChat(
  supabase: SupabaseClient,
  chatId: string,
): Promise<ChatRow | null> {
  const { data, error } = await supabase
    .from("chats")
    .select("id, owner_id, title, source, closed_at, extracted_at")
    .eq("id", chatId)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatRow | null) ?? null;
}

export async function loadMessages(
  supabase: SupabaseClient,
  chatId: string,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export function formatTranscript(rows: MessageRow[]): string {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => {
      const speaker = r.role === "user" ? "USER" : "OTHER";
      return `[${speaker}] ${r.content}`;
    })
    .join("\n\n");
}

export async function loadRelationshipDirectory(
  supabase: SupabaseClient,
): Promise<RelationshipDirectoryEntry[]> {
  const { data, error } = await supabase
    .from("relationships")
    .select(
      "id, target_type, role, target_contact_id, target_group_id, contact:contacts!target_contact_id(name), group:groups!target_group_id(name)",
    )
    .order("created_at", { ascending: false })
    .limit(RELATIONSHIP_CAP);
  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    target_type: "contact" | "group";
    role: string | null;
    target_contact_id: string | null;
    target_group_id: string | null;
    contact: { name: string } | null;
    group: { name: string } | null;
  }>).map((row) => ({
    id: row.id,
    targetType: row.target_type,
    name:
      row.target_type === "contact"
        ? row.contact?.name ?? "(unnamed contact)"
        : row.group?.name ?? "(unnamed group)",
    role: row.role,
    targetContactId: row.target_contact_id,
    targetGroupId: row.target_group_id,
  }));
}

export async function resolveRelationship(
  supabase: SupabaseClient,
  relationshipId: string,
): Promise<ResolvedRelationship | null> {
  const { data, error } = await supabase
    .from("relationships")
    .select("id, target_type, target_contact_id, target_group_id")
    .eq("id", relationshipId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    id: string;
    target_type: "contact" | "group";
    target_contact_id: string | null;
    target_group_id: string | null;
  };
  return {
    id: row.id,
    targetType: row.target_type,
    targetContactId: row.target_contact_id,
    targetGroupId: row.target_group_id,
  };
}

export async function loadExistingContextSummary(
  supabase: SupabaseClient,
): Promise<string> {
  const [interactionsRes, threadsRes] = await Promise.all([
    supabase
      .from("interactions")
      .select(
        "time, kind, notes, interaction_contacts(contacts(name))",
      )
      .order("time", { ascending: false })
      .limit(RECENT_INTERACTION_CAP),
    supabase
      .from("open_threads")
      .select("description, direction, closed_at")
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(OPEN_THREAD_CAP),
  ]);
  if (interactionsRes.error) throw interactionsRes.error;
  if (threadsRes.error) throw threadsRes.error;

  const interactionLines = ((interactionsRes.data ?? []) as Array<{
    time: string;
    kind: string;
    notes: string | null;
    interaction_contacts: Array<{ contacts: { name: string } | null }>;
  }>).map((row) => {
    const names = row.interaction_contacts
      .map((l) => l.contacts?.name)
      .filter(Boolean)
      .join(", ");
    const note = row.notes ? ` — ${row.notes.slice(0, 120)}` : "";
    return `- ${row.time.slice(0, 10)} ${row.kind} (${names || "?"})${note}`;
  });

  const threadLines = ((threadsRes.data ?? []) as Array<{
    description: string;
    direction: string;
  }>).map(
    (row) => `- [${row.direction}] ${row.description.slice(0, 120)}`,
  );

  return [
    "Recent interactions (avoid duplicating):",
    interactionLines.length ? interactionLines.join("\n") : "(none)",
    "",
    "Open commitments (avoid duplicating):",
    threadLines.length ? threadLines.join("\n") : "(none)",
  ].join("\n");
}

export function formatRelationshipDirectory(
  entries: RelationshipDirectoryEntry[],
): string {
  if (entries.length === 0) return "(no relationships yet)";
  return entries
    .map(
      (e) =>
        `- ${e.name} (id=${e.id}, type=${e.targetType}${e.role ? `, role=${e.role}` : ""})`,
    )
    .join("\n");
}
