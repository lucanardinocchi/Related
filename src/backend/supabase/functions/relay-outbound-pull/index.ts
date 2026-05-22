// relay-outbound-pull Edge Function — Mac relay fetches pending outbound
// messages to send via imsg. Device auth required.
//
// Deploy:
//   supabase functions deploy relay-outbound-pull --no-verify-jwt
//
// deno-lint-ignore-file no-explicit-any

import {
  createAdminClient,
  jsonResponse,
  RELAY_CORS_HEADERS,
  verifyRelayDevice,
} from "../_shared/relayAuth.ts";

async function loadGroupMemberPhones(
  adminClient: any,
  ownerId: string,
  groupIds: string[],
): Promise<Map<string, string[]>> {
  const uniqueGroupIds = [...new Set(groupIds)];
  const result = new Map<string, string[]>();
  if (uniqueGroupIds.length === 0) return result;

  const { data: memberships, error } = await adminClient
    .from("contact_groups")
    .select("group_id, contact:contacts!inner(phone, owner_id)")
    .in("group_id", uniqueGroupIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of memberships ?? []) {
    const contact = row.contact as { phone: string | null; owner_id: string };
    if (contact.owner_id !== ownerId || !contact.phone) continue;
    const phones = result.get(row.group_id) ?? [];
    phones.push(contact.phone);
    result.set(row.group_id, phones);
  }

  return result;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RELAY_CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const adminClient = createAdminClient();
  const auth = await verifyRelayDevice(req, adminClient);
  if (auth instanceof Response) return auth;

  const { data, error } = await adminClient
    .from("outbound_queue")
    .select(
      `
      id,
      thread_id,
      contact_id,
      group_id,
      body,
      created_at,
      message_threads ( external_chat_id ),
      contacts ( phone )
    `,
    )
    .eq("owner_id", auth.ownerId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  const groupMemberPhones = await loadGroupMemberPhones(
    adminClient,
    auth.ownerId,
    (data ?? [])
      .map((row: { group_id: string | null }) => row.group_id)
      .filter((id): id is string => id !== null),
  );

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    threadId: row.thread_id,
    contactId: row.contact_id,
    groupId: row.group_id,
    body: row.body,
    createdAt: row.created_at,
    externalChatId: row.message_threads?.external_chat_id ?? null,
    contactPhone: row.contacts?.phone ?? null,
    participantHandles: row.group_id
      ? (groupMemberPhones.get(row.group_id) ?? [])
      : [],
  }));

  return jsonResponse(200, { ok: true, items });
}

if (import.meta.main) {
  Deno.serve(handler);
}
