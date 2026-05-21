import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export interface RelayDevice {
  id: string;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface RelayPairingCode {
  id: string;
  code: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface MessageThread {
  id: string;
  externalChatId: string;
  externalChatGuid: string | null;
  isGroup: boolean;
  displayName: string | null;
  contactId: string | null;
  groupId: string | null;
  participantHandles: string[];
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  threadId: string;
  externalMessageId: string;
  direction: MessageDirection;
  body: string;
  sentAt: string;
  service: string | null;
  createdAt: string;
}

export type OutboundQueueStatus = "pending" | "sent" | "failed";

export interface OutboundQueueItem {
  id: string;
  threadId: string | null;
  contactId: string | null;
  groupId: string | null;
  body: string;
  status: OutboundQueueStatus;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface MessagesClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface LinkThreadInput {
  contactId?: string | null;
  groupId?: string | null;
}

export interface SendMessageInput {
  threadId?: string;
  contactId?: string;
  groupId?: string;
  body: string;
}

interface RelayDeviceRow {
  id: string;
  name: string;
  last_seen_at: string | null;
  created_at: string;
}

interface MessageThreadRow {
  id: string;
  external_chat_id: string;
  external_chat_guid: string | null;
  is_group: boolean;
  display_name: string | null;
  contact_id: string | null;
  group_id: string | null;
  participant_handles: string[];
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  external_message_id: string;
  direction: MessageDirection;
  body: string;
  sent_at: string;
  service: string | null;
  created_at: string;
}

interface OutboundQueueRow {
  id: string;
  thread_id: string | null;
  contact_id: string | null;
  group_id: string | null;
  body: string;
  status: OutboundQueueStatus;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

interface CreatePairingCodeResponse {
  code: string;
  expires_at?: string;
  expiresAt?: string;
}

const RELAY_DEVICE_COLUMNS = "id, name, last_seen_at, created_at";

const MESSAGE_THREAD_COLUMNS =
  "id, external_chat_id, external_chat_guid, is_group, display_name, contact_id, group_id, participant_handles, last_message_at, created_at, updated_at";

const MESSAGE_COLUMNS =
  "id, thread_id, external_message_id, direction, body, sent_at, service, created_at";

const OUTBOUND_QUEUE_COLUMNS =
  "id, thread_id, contact_id, group_id, body, status, error, created_at, sent_at";

const RELAY_ONLINE_THRESHOLD_MS = 90_000;

/** Strip non-digits except a leading + for phone/handle matching. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

function toRelayDevice(row: RelayDeviceRow): RelayDevice {
  return {
    id: row.id,
    name: row.name,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

function toMessageThread(row: MessageThreadRow): MessageThread {
  return {
    id: row.id,
    externalChatId: row.external_chat_id,
    externalChatGuid: row.external_chat_guid,
    isGroup: row.is_group,
    displayName: row.display_name,
    contactId: row.contact_id,
    groupId: row.group_id,
    participantHandles: row.participant_handles ?? [],
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    externalMessageId: row.external_message_id,
    direction: row.direction,
    body: row.body,
    sentAt: row.sent_at,
    service: row.service,
    createdAt: row.created_at,
  };
}

function toOutboundQueueItem(row: OutboundQueueRow): OutboundQueueItem {
  return {
    id: row.id,
    threadId: row.thread_id,
    contactId: row.contact_id,
    groupId: row.group_id,
    body: row.body,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

/**
 * Reads Mac Messages relay state and enqueues outbound sends on behalf of
 * the signed-in User. Pairing and sync run through edge functions; RLS
 * enforces ownership on direct table access.
 */
export class MessagesClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: MessagesClientConfig): MessagesClient {
    return new MessagesClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async createPairingCode(): Promise<{ code: string; expiresAt: string }> {
    const { data, error } = await this.client.functions.invoke(
      "relay-pair",
      { body: { action: "create_code" } },
    );
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "relay-pair failed";
      throw new Error(errMsg);
    }
    const payload = (data ?? {}) as CreatePairingCodeResponse;
    const expiresAt = payload.expiresAt ?? payload.expires_at;
    if (!payload.code || !expiresAt) {
      throw new Error("relay-pair create_code returned incomplete payload");
    }
    return { code: payload.code, expiresAt };
  }

  async listRelayDevices(): Promise<RelayDevice[]> {
    const { data, error } = await this.client
      .from("relay_devices")
      .select(RELAY_DEVICE_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as RelayDeviceRow[]).map(toRelayDevice);
  }

  async isRelayOnline(): Promise<boolean> {
    const devices = await this.listRelayDevices();
    const cutoff = Date.now() - RELAY_ONLINE_THRESHOLD_MS;
    return devices.some(
      (device) =>
        device.lastSeenAt !== null &&
        new Date(device.lastSeenAt).getTime() >= cutoff,
    );
  }

  async listThreadsForContact(contactId: string): Promise<MessageThread[]> {
    const { data, error } = await this.client
      .from("message_threads")
      .select(MESSAGE_THREAD_COLUMNS)
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as MessageThreadRow[]).map(toMessageThread);
  }

  async listThreadsForGroup(groupId: string): Promise<MessageThread[]> {
    const { data, error } = await this.client
      .from("message_threads")
      .select(MESSAGE_THREAD_COLUMNS)
      .eq("group_id", groupId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as MessageThreadRow[]).map(toMessageThread);
  }

  async listUnlinkedThreads(): Promise<MessageThread[]> {
    const { data, error } = await this.client
      .from("message_threads")
      .select(MESSAGE_THREAD_COLUMNS)
      .is("contact_id", null)
      .is("group_id", null)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as MessageThreadRow[]).map(toMessageThread);
  }

  async listMessages(threadId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as MessageRow[]).map(toMessage);
  }

  async linkThread(
    threadId: string,
    input: LinkThreadInput,
  ): Promise<MessageThread> {
    const patch: Record<string, unknown> = {};
    if (input.contactId !== undefined) patch.contact_id = input.contactId;
    if (input.groupId !== undefined) patch.group_id = input.groupId;

    const { data, error } = await this.client
      .from("message_threads")
      .update(patch)
      .eq("id", threadId)
      .select(MESSAGE_THREAD_COLUMNS)
      .single();
    if (error) throw error;
    return toMessageThread(data as MessageThreadRow);
  }

  async sendMessage(input: SendMessageInput): Promise<OutboundQueueItem> {
    if (!input.threadId && !input.contactId && !input.groupId) {
      throw new Error(
        "sendMessage requires threadId, contactId, or groupId",
      );
    }

    const { data, error } = await this.client
      .from("outbound_queue")
      .insert({
        thread_id: input.threadId ?? null,
        contact_id: input.contactId ?? null,
        group_id: input.groupId ?? null,
        body: input.body,
        status: "pending",
      })
      .select(OUTBOUND_QUEUE_COLUMNS)
      .single();
    if (error) throw error;
    return toOutboundQueueItem(data as OutboundQueueRow);
  }
}
