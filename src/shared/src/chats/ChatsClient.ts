import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Chat — see src/shared/CONTEXT.md and ADR-0009.
 *
 * A bounded conversation with the Conversational Intelligence agent.
 * `closed_at` is null while the Chat is open and writable. When set, the
 * Chat is read-only and Extraction Pass runs exactly once over the
 * transcript.
 */
export type ChatSource = "conversational" | "pocket";

export interface Chat {
  id: string;
  title: string | null;
  source: ChatSource;
  createdAt: string;
  closedAt: string | null;
  /**
   * Stamp set by the extract-context Edge Function once the Extraction
   * Pass has run on this Chat's transcript. Null until extraction
   * completes (or the Chat is still open). Used as an idempotency
   * marker — re-invocations short-circuit on this.
   */
  extractedAt: string | null;
}

/**
 * Lightweight ChatSummary used by the chat list rail. Carries the most
 * recent message snippet so the rail can preview without a second round
 * trip per chat.
 */
export interface ChatSummary extends Chat {
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * One message in a Chat. `toolCalls` is non-null on assistant turns that
 * emitted tool_use blocks (rendered inline in the UI per ADR-0009).
 * `toolCallId` is non-null on tool-result messages produced by the agent
 * runtime — it references the tool_use block's id from the prior
 * assistant turn.
 */
export interface ChatMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  toolCalls: unknown[] | null;
  toolCallId: string | null;
  createdAt: string;
}

export interface AppendMessageInput {
  chatId: string;
  role: MessageRole;
  content: string;
  toolCalls?: unknown[] | null;
  toolCallId?: string | null;
}

export interface ChatsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Discriminated union of events streamed back by the chat-respond Edge
 * Function over SSE. The UI consumes these incrementally — `tool_use`
 * the moment Claude requests a tool; `tool_result` when the dispatcher
 * finishes; `text_delta` as the final reply tokens arrive; `done` once
 * the assistant message has been persisted.
 */
export type ChatRespondEvent =
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      preview: string;
      error?: string;
    }
  | { type: "text_delta"; delta: string }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; message: string };

export interface ChatsClientOptions {
  /**
   * Override the global fetch implementation. Used by tests; production
   * code lets the default global `fetch` pick up.
   */
  fetchImpl?: typeof fetch;
  /**
   * Override the Edge Functions base URL (e.g.
   * `https://<ref>.supabase.co/functions/v1`). Used by tests; production
   * code derives this from the Supabase client.
   */
  functionsUrl?: string;
}

interface ChatRow {
  id: string;
  title: string | null;
  source?: ChatSource;
  created_at: string;
  closed_at: string | null;
  extracted_at: string | null;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  created_at: string;
}

const CHAT_COLUMNS =
  "id, title, source, created_at, closed_at, extracted_at";
const CHAT_COLUMNS_LEGACY = "id, title, created_at, closed_at, extracted_at";
const MESSAGE_COLUMNS =
  "id, chat_id, role, content, tool_calls, tool_call_id, created_at";

function toChat(row: ChatRow): Chat {
  return {
    id: row.id,
    title: row.title,
    source: row.source ?? "conversational",
    createdAt: row.created_at,
    closedAt: row.closed_at,
    extractedAt: row.extracted_at,
  };
}

async function selectChatsOrdered(
  client: SupabaseClient,
  filterSource?: ChatSource,
): Promise<ChatRow[]> {
  const build = (columns: string, withSourceFilter: boolean) => {
    let q = client.from("chats").select(columns);
    if (withSourceFilter && filterSource) {
      q = q.eq("source", filterSource);
    }
    return q.order("created_at", { ascending: false });
  };

  let { data, error } = await build(CHAT_COLUMNS, true);
  if (error?.code === "42703") {
    ({ data, error } = await build(CHAT_COLUMNS_LEGACY, false));
  }
  if (error) throw error;
  return (data ?? []) as unknown as ChatRow[];
}

async function hydrateChatSummaries(
  client: SupabaseClient,
  chats: Chat[],
): Promise<ChatSummary[]> {
  if (chats.length === 0) return [];

  const ids = chats.map((c) => c.id);
  const { data: msgData, error: msgError } = await client
    .from("chat_messages")
    .select("chat_id, content, created_at")
    .in("chat_id", ids)
    .order("created_at", { ascending: false });
  if (msgError) throw msgError;

  const previews = new Map<
    string,
    { content: string; createdAt: string; count: number }
  >();
  for (const row of (msgData ?? []) as Array<{
    chat_id: string;
    content: string;
    created_at: string;
  }>) {
    const existing = previews.get(row.chat_id);
    if (!existing) {
      previews.set(row.chat_id, {
        content: row.content,
        createdAt: row.created_at,
        count: 1,
      });
    } else {
      existing.count += 1;
    }
  }

  return chats.map((c) => {
    const p = previews.get(c.id);
    return {
      ...c,
      lastMessagePreview: p?.content ?? null,
      lastMessageAt: p?.createdAt ?? null,
      messageCount: p?.count ?? 0,
    };
  });
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    toolCalls: row.tool_calls,
    toolCallId: row.tool_call_id,
    createdAt: row.created_at,
  };
}

/**
 * Reads and writes Chat + ChatMessage rows on behalf of the signed-in
 * User. RLS enforces ownership server-side. Closed Chats are read-only by
 * application convention (this client refuses appendMessage / closeChat
 * on already-closed Chats); the DB does not enforce this in v1.
 */
export class ChatsClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly opts: ChatsClientOptions = {},
  ) {}

  static fromConfig(
    config: ChatsClientConfig,
    opts: ChatsClientOptions = {},
  ): ChatsClient {
    return new ChatsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      opts,
    );
  }

  private functionsBaseUrl(): string {
    if (this.opts.functionsUrl) return this.opts.functionsUrl;
    const url = (this.client as unknown as { supabaseUrl?: string })
      .supabaseUrl;
    if (!url) {
      throw new Error(
        "ChatsClient could not derive Supabase URL — pass functionsUrl in options.",
      );
    }
    return `${url.replace(/\/$/, "")}/functions/v1`;
  }

  /** Conversational Chats only (legacy surfaces). */
  async listChats(): Promise<ChatSummary[]> {
    const rows = await selectChatsOrdered(this.client, "conversational");
    return hydrateChatSummaries(this.client, rows.map(toChat));
  }

  /** All Chats for /agent — Conversational + imported Pocket transcripts. */
  async listAgentChats(): Promise<ChatSummary[]> {
    const rows = await selectChatsOrdered(this.client);
    return hydrateChatSummaries(this.client, rows.map(toChat));
  }

  async getChat(id: string): Promise<Chat> {
    const { data, error } = await this.client
      .from("chats")
      .select(CHAT_COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw error;
    return toChat(data as ChatRow);
  }

  async createChat(title?: string | null): Promise<Chat> {
    const { data, error } = await this.client
      .from("chats")
      .insert({ title: title ?? null })
      .select(CHAT_COLUMNS)
      .single();
    if (error) throw error;
    return toChat(data as ChatRow);
  }

  async closeChat(id: string): Promise<Chat> {
    const current = await this.getChat(id);
    if (current.closedAt) return current;
    const { data, error } = await this.client
      .from("chats")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", id)
      .select(CHAT_COLUMNS)
      .single();
    if (error) throw error;
    return toChat(data as ChatRow);
  }

  async renameChat(id: string, title: string | null): Promise<Chat> {
    const { data, error } = await this.client
      .from("chats")
      .update({ title })
      .eq("id", id)
      .select(CHAT_COLUMNS)
      .single();
    if (error) throw error;
    return toChat(data as ChatRow);
  }

  async deleteChat(id: string): Promise<void> {
    const { error } = await this.client.from("chats").delete().eq("id", id);
    if (error) throw error;
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.client
      .from("chat_messages")
      .select(MESSAGE_COLUMNS)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as MessageRow[]).map(toMessage);
  }

  async appendMessage(input: AppendMessageInput): Promise<ChatMessage> {
    const chat = await this.getChat(input.chatId);
    if (chat.closedAt) {
      throw new Error(
        `Chat ${input.chatId} is closed; cannot append messages.`,
      );
    }
    const { data, error } = await this.client
      .from("chat_messages")
      .insert({
        chat_id: input.chatId,
        role: input.role,
        content: input.content,
        tool_calls: input.toolCalls ?? null,
        tool_call_id: input.toolCallId ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) throw error;
    return toMessage(data as MessageRow);
  }

  /**
   * Invoke the chat-respond Edge Function — Conversational Intelligence
   * agent. Server-side, the function loads the transcript, runs the
   * tool-use loop with the read-only tool surface, and persists the
   * assistant turn to chat_messages. The returned message is the same
   * row, ready for the UI to append locally.
   */
  async respond(chatId: string): Promise<ChatMessage> {
    const { data, error } = await this.client.functions.invoke(
      "chat-respond",
      { body: { chatId } },
    );
    if (error) {
      const errMsg = (error as { message?: string }).message ??
        "chat-respond failed";
      throw new Error(errMsg);
    }
    const message = (data as { message?: MessageRow })?.message;
    if (!message) throw new Error("chat-respond returned no message");
    return toMessage(message);
  }

  /**
   * Stream the chat-respond Edge Function as SSE — Conversational
   * Intelligence with token streaming per ADR-0009 (amended). Yields
   * `tool_use`, `tool_result`, `text_delta`, `done`, and `error` events
   * as they arrive from the server. The final `done` event carries the
   * persisted `chat_messages` row; callers should use it to update
   * local state rather than refetching.
   */
  async *respondStream(chatId: string): AsyncIterable<ChatRespondEvent> {
    const fetchImpl = this.opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const session = await this.client.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      yield { type: "error", message: "no active session" };
      return;
    }
    const url = `${this.functionsBaseUrl()}/chat-respond`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatId }),
      });
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      yield {
        type: "error",
        message: `chat-respond ${response.status}: ${text.slice(0, 200)}`,
      };
      return;
    }

    for await (const sseEvent of parseSseStream(response.body)) {
      const mapped = toChatRespondEvent(sseEvent);
      if (mapped) yield mapped;
    }
  }

  /**
   * Invoke the extract-context Edge Function — Extraction Pass per
   * ADR-0012. Triggered after closeChat. Direct-writes relationship
   * context (notes, interactions, comms, commitments) with provenance.
   * Idempotent on the server: a second invocation returns { skipped: true }.
   */
  async extract(chatId: string): Promise<ExtractionResult> {
    const { data, error } = await this.client.functions.invoke(
      "extract-context",
      { body: { chatId } },
    );
    if (error) {
      const errMsg = (error as { message?: string }).message ??
        "extract-context failed";
      throw new Error(errMsg);
    }
    return data as ExtractionResult;
  }
}

export type ExtractionResult =
  | {
      ok: true;
      extracted_at: string;
      notesLogged: number;
      interactionsLogged: number;
      commsLogged: number;
      commitmentsOpened: number;
      toolErrors: string[];
    }
  | { skipped: true; reason: string };

/** User-facing summary after close → extract (web + mobile toasts). */
export function formatExtractionResult(result: ExtractionResult): string {
  if ("skipped" in result && result.skipped) {
    return `Extraction skipped: ${result.reason}.`;
  }
  if (!("ok" in result)) return "Extraction complete.";
  const bits: string[] = [];
  if (result.notesLogged > 0) {
    bits.push(
      `${result.notesLogged} note${result.notesLogged === 1 ? "" : "s"}`,
    );
  }
  if (result.interactionsLogged > 0) {
    bits.push(
      `${result.interactionsLogged} interaction${result.interactionsLogged === 1 ? "" : "s"}`,
    );
  }
  if (result.commsLogged > 0) {
    bits.push(`${result.commsLogged} comms`);
  }
  if (result.commitmentsOpened > 0) {
    bits.push(
      `${result.commitmentsOpened} commitment${result.commitmentsOpened === 1 ? "" : "s"}`,
    );
  }
  const head = bits.length ? bits.join(", ") : "no relationship context logged";
  const tail = result.toolErrors.length
    ? ` (with ${result.toolErrors.length} tool error${result.toolErrors.length === 1 ? "" : "s"})`
    : "";
  return `Extraction complete: ${head}${tail}.`;
}

interface ParsedSseEvent {
  event: string;
  data: string;
}

/**
 * Parse a `text/event-stream` ReadableStream into a sequence of
 * `{ event, data }` records. Supports the subset of the SSE spec we
 * actually emit: `event:` line, one `data:` line, blank line terminator.
 */
async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<ParsedSseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";
  let currentData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
      buffer = buffer.slice(newlineIdx + 1);
      if (line === "") {
        if (currentData) {
          yield { event: currentEvent, data: currentData };
        }
        currentEvent = "message";
        currentData = "";
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value =
        colon === -1
          ? ""
          : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") currentEvent = value;
      else if (field === "data") {
        currentData = currentData ? `${currentData}\n${value}` : value;
      }
    }
    if (done) {
      if (currentData) {
        yield { event: currentEvent, data: currentData };
      }
      break;
    }
  }
}

function toChatRespondEvent(
  raw: ParsedSseEvent,
): ChatRespondEvent | null {
  let payload: unknown;
  try {
    payload = raw.data ? JSON.parse(raw.data) : {};
  } catch {
    return { type: "error", message: `unparseable SSE data: ${raw.data}` };
  }
  switch (raw.event) {
    case "tool_use": {
      const p = payload as { id?: string; name?: string; input?: unknown };
      return {
        type: "tool_use",
        id: p.id ?? "",
        name: p.name ?? "",
        input: (p.input as Record<string, unknown>) ?? {},
      };
    }
    case "tool_result": {
      const p = payload as { id?: string; preview?: string; error?: string };
      return {
        type: "tool_result",
        id: p.id ?? "",
        preview: p.preview ?? "",
        error: p.error,
      };
    }
    case "text_delta": {
      const p = payload as { delta?: string };
      return { type: "text_delta", delta: p.delta ?? "" };
    }
    case "done": {
      const p = payload as { message?: MessageRow };
      if (!p.message) return { type: "error", message: "done with no message" };
      return { type: "done", message: toMessage(p.message) };
    }
    case "error": {
      const p = payload as { message?: string };
      return { type: "error", message: p.message ?? "unknown error" };
    }
    default:
      return null;
  }
}
