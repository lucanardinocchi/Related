// deno-lint-ignore-file no-explicit-any

export type InstagramMessageDirection = "inbound" | "outbound";

export interface InstagramMessageRow {
  ig_message_id: string;
  direction: InstagramMessageDirection;
  from_username: string | null;
  from_scoped_id: string | null;
  text: string;
  sent_at: string;
}

export function normalizeInstagramUsername(
  username: string | null | undefined,
): string {
  if (!username) return "";
  return username.trim().replace(/^@/, "").toLowerCase();
}

export async function findOwnerIdForInstagramAccount(
  supabase: any,
  instagramAccountId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_provider_tokens")
    .select("owner_id")
    .eq("provider", "instagram")
    .eq("provider_account_id", instagramAccountId)
    .maybeSingle();
  if (error || !data) return null;
  return data.owner_id as string;
}

export async function findContactByScopedId(
  supabase: any,
  ownerId: string,
  scopedId: string,
): Promise<{ id: string; instagram_username: string | null } | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, instagram_username, instagram_scoped_id")
    .eq("owner_id", ownerId)
    .eq("instagram_scoped_id", scopedId)
    .maybeSingle();
  if (!error && data) {
    return {
      id: data.id as string,
      instagram_username: data.instagram_username as string | null,
    };
  }

  const { data: rows, error: listError } = await supabase
    .from("contacts")
    .select("id, instagram_username, instagram_scoped_id")
    .eq("owner_id", ownerId);

  if (listError || !rows) return null;
  for (const row of rows as Array<{
    id: string;
    instagram_username: string | null;
    instagram_scoped_id: string | null;
  }>) {
    if (row.instagram_scoped_id === scopedId) {
      return { id: row.id, instagram_username: row.instagram_username };
    }
  }
  return null;
}

export async function upsertInstagramMessage(
  supabase: any,
  input: {
    ownerId: string;
    contactId: string | null;
    message: InstagramMessageRow;
  },
): Promise<void> {
  await supabase.from("instagram_messages").upsert(
    {
      owner_id: input.ownerId,
      contact_id: input.contactId,
      ig_message_id: input.message.ig_message_id,
      direction: input.message.direction,
      from_username: input.message.from_username,
      from_scoped_id: input.message.from_scoped_id,
      text: input.message.text,
      sent_at: input.message.sent_at,
    },
    { onConflict: "owner_id,ig_message_id" },
  );
}

export async function linkContactScopedId(
  supabase: any,
  ownerId: string,
  contactId: string,
  scopedId: string,
): Promise<void> {
  await supabase
    .from("contacts")
    .update({
      instagram_scoped_id: scopedId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("owner_id", ownerId)
    .is("instagram_scoped_id", null);
}

/** Subscribe the connected IG account to `messages` webhooks. */
export async function subscribeInstagramWebhooks(
  instagramAccountId: string,
  accessToken: string,
): Promise<void> {
  const url =
    `https://graph.instagram.com/v21.0/${encodeURIComponent(instagramAccountId)}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Instagram subscribed_apps failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
}
