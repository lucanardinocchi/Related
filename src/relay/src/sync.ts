import type { RelayConfig } from "./config.js";
import type { ImsgChat, ImsgMessage } from "./imsg.js";

export interface RelayThreadPayload {
  externalChatId: string;
  externalChatGuid?: string;
  isGroup: boolean;
  displayName?: string;
  participantHandles: string[];
  lastMessageAt?: string;
}

export interface RelayMessagePayload {
  externalChatId: string;
  externalMessageId: string;
  direction: "inbound" | "outbound";
  body: string;
  sentAt: string;
  service?: string;
}

export interface RelaySyncBody {
  threads?: RelayThreadPayload[];
  messages?: RelayMessagePayload[];
  heartbeat?: boolean;
}

export interface RelaySyncResponse {
  ok: boolean;
  linked?: number;
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function functionsUrl(config: RelayConfig, name: string): string {
  return `${normalizeSupabaseUrl(config.supabaseUrl)}/functions/v1/${name}`;
}

export async function relayFetch<T>(
  config: RelayConfig,
  functionName: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(functionsUrl(config, functionName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Device-Id": config.deviceId,
      "X-Relay-Device-Secret": config.deviceSecret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : text || response.statusText;
    throw new Error(`${functionName} failed (${response.status}): ${message}`);
  }

  return data as T;
}

export function mapChatToThread(chat: ImsgChat): RelayThreadPayload {
  return {
    externalChatId: String(chat.id),
    externalChatGuid: chat.guid,
    isGroup: Boolean(chat.is_group),
    displayName: chat.display_name ?? chat.name,
    participantHandles: chat.participants ?? [],
    lastMessageAt: chat.last_message_at,
  };
}

export function mapMessageToPayload(message: ImsgMessage): RelayMessagePayload | null {
  const externalChatId =
    message.chat_id !== undefined ? String(message.chat_id) : undefined;
  const externalMessageId =
    message.guid ?? (message.id !== undefined ? String(message.id) : undefined);
  const sentAt = message.created_at;

  if (!externalChatId || !externalMessageId || !sentAt) {
    return null;
  }

  return {
    externalChatId,
    externalMessageId,
    direction: message.is_from_me ? "outbound" : "inbound",
    body: message.text ?? "",
    sentAt,
    service: message.service,
  };
}

export function mapMessages(messages: ImsgMessage[]): RelayMessagePayload[] {
  return messages
    .map(mapMessageToPayload)
    .filter((message): message is RelayMessagePayload => message !== null);
}

export async function postSync(
  config: RelayConfig,
  body: RelaySyncBody,
): Promise<RelaySyncResponse> {
  return relayFetch<RelaySyncResponse>(config, "relay-sync", body);
}

export async function sendHeartbeat(config: RelayConfig): Promise<void> {
  await postSync(config, { heartbeat: true });
}

export async function syncThreadsAndMessages(
  config: RelayConfig,
  threads: RelayThreadPayload[],
  messages: RelayMessagePayload[],
): Promise<RelaySyncResponse> {
  return postSync(config, {
    threads: threads.length > 0 ? threads : undefined,
    messages: messages.length > 0 ? messages : undefined,
  });
}

export async function pairExchange(input: {
  supabaseUrl: string;
  code: string;
  deviceName: string;
  deviceSecret: string;
}): Promise<{ deviceId: string; ownerId: string }> {
  const url = `${normalizeSupabaseUrl(input.supabaseUrl)}/functions/v1/relay-pair`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "exchange",
      code: input.code,
      deviceName: input.deviceName,
      deviceSecret: input.deviceSecret,
    }),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    data = JSON.parse(text);
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : text || response.statusText;
    throw new Error(`Pairing failed (${response.status}): ${message}`);
  }

  const result = data as { deviceId?: string; ownerId?: string };
  if (!result.deviceId || !result.ownerId) {
    throw new Error("Pairing response missing deviceId or ownerId");
  }

  return { deviceId: result.deviceId, ownerId: result.ownerId };
}

export function generateDeviceSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
