// deno-lint-ignore-file no-explicit-any

export type XMessageDirection = "sent" | "received";

export interface XMessageRow {
  x_message_id: string;
  x_conversation_id: string | null;
  direction: XMessageDirection;
  text: string;
  sent_at: string;
}

export function normalizeXUsername(
  username: string | null | undefined,
): string {
  if (!username) return "";
  return username.trim().replace(/^@/, "").toLowerCase();
}

export async function findOwnerIdForXAccount(
  supabase: any,
  xAccountId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_provider_tokens")
    .select("owner_id")
    .eq("provider", "x")
    .eq("provider_account_id", xAccountId)
    .maybeSingle();
  if (error || !data) return null;
  return data.owner_id as string;
}

export async function findContactByXUserId(
  supabase: any,
  ownerId: string,
  xUserId: string,
): Promise<{ id: string; x_username: string | null } | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, x_username, x_user_id")
    .eq("owner_id", ownerId)
    .eq("x_user_id", xUserId)
    .maybeSingle();
  if (!error && data) {
    return {
      id: data.id as string,
      x_username: data.x_username as string | null,
    };
  }

  const { data: rows, error: listError } = await supabase
    .from("contacts")
    .select("id, x_username, x_user_id")
    .eq("owner_id", ownerId);

  if (listError || !rows) return null;
  for (const row of rows as Array<{
    id: string;
    x_username: string | null;
    x_user_id: string | null;
  }>) {
    if (row.x_user_id === xUserId) {
      return { id: row.id, x_username: row.x_username };
    }
  }
  return null;
}

export async function upsertXMessage(
  supabase: any,
  input: {
    ownerId: string;
    contactId: string | null;
    groupId: string | null;
    xMessageId: string;
    xConversationId: string | null;
    direction: XMessageDirection;
    text: string;
    sentAt: string;
  },
): Promise<void> {
  await supabase.from("x_messages").upsert(
    {
      owner_id: input.ownerId,
      contact_id: input.contactId,
      group_id: input.groupId,
      x_message_id: input.xMessageId,
      x_conversation_id: input.xConversationId,
      direction: input.direction,
      text: input.text,
      sent_at: input.sentAt,
    },
    { onConflict: "owner_id,x_message_id" },
  );
}

export async function linkContactXUserId(
  supabase: any,
  ownerId: string,
  contactId: string,
  xUserId: string,
): Promise<void> {
  await supabase
    .from("contacts")
    .update({
      x_user_id: xUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("owner_id", ownerId)
    .is("x_user_id", null);
}
