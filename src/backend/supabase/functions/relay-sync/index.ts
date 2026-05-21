// relay-sync Edge Function — Mac relay pushes threads/messages and
// heartbeats. Device auth via X-Relay-Device-Id + X-Relay-Device-Secret.
//
// Deploy:
//   supabase functions deploy relay-sync
//
// deno-lint-ignore-file no-explicit-any

import {
  createAdminClient,
  jsonResponse,
  normalizePhoneDigits,
  RELAY_CORS_HEADERS,
  verifyRelayDevice,
} from "../_shared/relayAuth.ts";

interface SyncThreadInput {
  external_chat_id: string;
  external_chat_guid?: string | null;
  is_group?: boolean;
  display_name?: string | null;
  participant_handles?: string[];
  last_message_at?: string | null;
}

interface SyncMessageInput {
  external_chat_id: string;
  external_message_id: string;
  direction: "inbound" | "outbound";
  body?: string;
  sent_at: string;
  service?: string | null;
}

interface SyncRequest {
  threads?: SyncThreadInput[];
  messages?: SyncMessageInput[];
  heartbeat?: boolean;
}

interface ThreadRow {
  id: string;
  external_chat_id: string;
  is_group: boolean;
  contact_id: string | null;
  group_id: string | null;
  participant_handles: string[];
}

async function upsertThreads(
  adminClient: any,
  ownerId: string,
  threads: SyncThreadInput[],
): Promise<Map<string, string>> {
  const externalToThreadId = new Map<string, string>();
  if (threads.length === 0) return externalToThreadId;

  const now = new Date().toISOString();
  const rows = threads.map((thread) => ({
    owner_id: ownerId,
    external_chat_id: thread.external_chat_id,
    external_chat_guid: thread.external_chat_guid ?? null,
    is_group: thread.is_group ?? false,
    display_name: thread.display_name ?? null,
    participant_handles: thread.participant_handles ?? [],
    last_message_at: thread.last_message_at ?? null,
    updated_at: now,
  }));

  const { data, error } = await adminClient
    .from("message_threads")
    .upsert(rows, { onConflict: "owner_id,external_chat_id" })
    .select("id, external_chat_id");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    externalToThreadId.set(row.external_chat_id, row.id);
  }

  return externalToThreadId;
}

async function resolveThreadIds(
  adminClient: any,
  ownerId: string,
  externalChatIds: string[],
  externalToThreadId: Map<string, string>,
): Promise<void> {
  const missing = externalChatIds.filter((id) => !externalToThreadId.has(id));
  if (missing.length === 0) return;

  const { data, error } = await adminClient
    .from("message_threads")
    .select("id, external_chat_id")
    .eq("owner_id", ownerId)
    .in("external_chat_id", missing);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    externalToThreadId.set(row.external_chat_id, row.id);
  }
}

async function upsertMessages(
  adminClient: any,
  ownerId: string,
  messages: SyncMessageInput[],
  externalToThreadId: Map<string, string>,
): Promise<void> {
  if (messages.length === 0) return;

  await resolveThreadIds(
    adminClient,
    ownerId,
    [...new Set(messages.map((m) => m.external_chat_id))],
    externalToThreadId,
  );

  const rows = [];
  for (const message of messages) {
    const threadId = externalToThreadId.get(message.external_chat_id);
    if (!threadId) continue;

    rows.push({
      owner_id: ownerId,
      thread_id: threadId,
      external_message_id: message.external_message_id,
      direction: message.direction,
      body: message.body ?? "",
      sent_at: message.sent_at,
      service: message.service ?? null,
    });
  }

  if (rows.length === 0) return;

  const { error } = await adminClient
    .from("messages")
    .upsert(rows, {
      onConflict: "owner_id,external_message_id",
      ignoreDuplicates: true,
    });

  if (error) {
    throw new Error(error.message);
  }
}

async function autoLinkThreads(
  adminClient: any,
  ownerId: string,
  externalChatIds: string[],
): Promise<number> {
  if (externalChatIds.length === 0) return 0;

  const { data: threads, error: threadsError } = await adminClient
    .from("message_threads")
    .select(
      "id, external_chat_id, is_group, contact_id, group_id, participant_handles",
    )
    .eq("owner_id", ownerId)
    .in("external_chat_id", externalChatIds);

  if (threadsError) {
    throw new Error(threadsError.message);
  }

  const unlinked = (threads ?? []).filter(
    (t: ThreadRow) => !t.contact_id && !t.group_id,
  );
  if (unlinked.length === 0) return 0;

  const { data: contacts, error: contactsError } = await adminClient
    .from("contacts")
    .select("id, phone")
    .eq("owner_id", ownerId)
    .not("phone", "is", null);

  if (contactsError) {
    throw new Error(contactsError.message);
  }

  const phoneToContactId = new Map<string, string>();
  for (const contact of contacts ?? []) {
    const digits = normalizePhoneDigits(contact.phone);
    if (digits) {
      phoneToContactId.set(digits, contact.id);
    }
  }

  const groupScores = await buildGroupPhoneScores(adminClient, ownerId);

  let linked = 0;
  const now = new Date().toISOString();

  for (const thread of unlinked) {
    const handles = (thread.participant_handles ?? []).map(normalizePhoneDigits)
      .filter(Boolean);
    const update: { contact_id?: string; group_id?: string; updated_at: string } =
      { updated_at: now };

    if (!thread.is_group && handles.length === 1) {
      const contactId = phoneToContactId.get(handles[0]);
      if (contactId) {
        update.contact_id = contactId;
      }
    } else if (thread.is_group && handles.length > 0) {
      const handleSet = new Set(handles);
      let bestGroupId: string | null = null;
      let bestScore = 1;

      for (const [groupId, phones] of groupScores) {
        let score = 0;
        for (const phone of phones) {
          if (handleSet.has(phone)) score++;
        }
        if (score >= 2 && score > bestScore) {
          bestScore = score;
          bestGroupId = groupId;
        }
      }

      if (bestGroupId) {
        update.group_id = bestGroupId;
      }
    }

    if (!update.contact_id && !update.group_id) continue;

    const { error } = await adminClient
      .from("message_threads")
      .update(update)
      .eq("id", thread.id)
      .eq("owner_id", ownerId);

    if (error) {
      throw new Error(error.message);
    }
    linked++;
  }

  return linked;
}

async function buildGroupPhoneScores(
  adminClient: any,
  ownerId: string,
): Promise<Map<string, Set<string>>> {
  const { data, error } = await adminClient
    .from("contact_groups")
    .select("group_id, contacts ( phone )")
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(error.message);
  }

  const groupScores = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const digits = normalizePhoneDigits(row.contacts?.phone);
    if (!digits) continue;
    const phones = groupScores.get(row.group_id) ?? new Set<string>();
    phones.add(digits);
    groupScores.set(row.group_id, phones);
  }

  return groupScores;
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

  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  const threads = body.threads ?? [];
  const messages = body.messages ?? [];

  try {
    if (body.heartbeat) {
      await adminClient
        .from("relay_devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", auth.deviceId)
        .eq("owner_id", auth.ownerId);
    }

    const externalToThreadId = await upsertThreads(
      adminClient,
      auth.ownerId,
      threads,
    );

    await upsertMessages(adminClient, auth.ownerId, messages, externalToThreadId);

    const linked = await autoLinkThreads(
      adminClient,
      auth.ownerId,
      threads.map((t) => t.external_chat_id),
    );

    return jsonResponse(200, { ok: true, linked });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(500, { error: message });
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
