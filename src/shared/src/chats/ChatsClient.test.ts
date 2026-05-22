import type { SupabaseClient } from "@supabase/supabase-js";
import { ChatsClient } from "./ChatsClient";

type Resolved<T> =
  | Promise<{ data: T; error: null }>
  | Promise<{ data: null; error: { message: string } }>;

/**
 * Thin mock of the postgrest query-builder shape ChatsClient calls. Each
 * test arms only the specific terminator it needs (single / order / in).
 */
function makeQuery() {
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn<Resolved<unknown>, []>();
  const inFn = jest.fn(() => ({ order }));

  const eqForUpdate = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  const eqForDelete = jest.fn(() =>
    Promise.resolve({ data: null, error: null }),
  );
  const eqForSelect = jest.fn(() => ({ single, order }));

  const update = jest.fn(() => ({ eq: eqForUpdate }));
  const del = jest.fn(() => ({ eq: eqForDelete }));
  const insertSelect = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select: insertSelect }));

  // select(...) is reused for both list (.order) and single-row (.eq.single).
  const select = jest.fn(() => ({
    eq: eqForSelect,
    order,
    in: inFn,
  }));

  const invoke = jest.fn();

  const from = jest.fn((_table: string) => ({
    insert,
    select,
    update,
    delete: del,
  }));
  return {
    from,
    invoke,
    insert,
    insertSelect,
    select,
    single,
    order,
    inFn,
    update,
    del,
    eqForUpdate,
    eqForSelect,
    eqForDelete,
  };
}

function withClient(opts: {
  fetchImpl?: typeof fetch;
  functionsUrl?: string;
  accessToken?: string;
} = {}) {
  const q = makeQuery();
  const session = {
    data: {
      session: opts.accessToken ? { access_token: opts.accessToken } : null,
    },
  };
  const supa = {
    from: q.from,
    functions: { invoke: q.invoke },
    auth: { getSession: jest.fn(async () => session) },
  } as unknown as SupabaseClient;
  return {
    q,
    chats: new ChatsClient(supa, {
      fetchImpl: opts.fetchImpl,
      functionsUrl: opts.functionsUrl,
    }),
  };
}

/**
 * Builds a Response whose body streams the given chunks as a
 * `text/event-stream`. Used by SSE-streaming tests.
 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const CHAT_ROW = {
  id: "c-1",
  title: null,
  created_at: "2026-05-21T10:00:00Z",
  closed_at: null,
  extracted_at: null,
};

describe("ChatsClient", () => {
  it("createChat inserts a row with the given title and returns the typed Chat", async () => {
    const { q, chats } = withClient();
    q.single.mockResolvedValueOnce({
      data: { ...CHAT_ROW, title: "Birthday plans" },
      error: null,
    });

    const chat = await chats.createChat("Birthday plans");

    expect(q.from).toHaveBeenCalledWith("chats");
    expect(q.insert).toHaveBeenCalledWith({ title: "Birthday plans" });
    expect(chat).toEqual({
      id: "c-1",
      title: "Birthday plans",
      createdAt: "2026-05-21T10:00:00Z",
      closedAt: null,
      extractedAt: null,
    });
  });

  it("listChats returns chats with last-message previews and counts", async () => {
    const { q, chats } = withClient();
    q.order.mockResolvedValueOnce({
      data: [CHAT_ROW, { ...CHAT_ROW, id: "c-2" }],
      error: null,
    });
    q.order.mockResolvedValueOnce({
      data: [
        {
          chat_id: "c-1",
          content: "later message",
          created_at: "2026-05-21T11:00:00Z",
        },
        {
          chat_id: "c-1",
          content: "earlier",
          created_at: "2026-05-21T10:30:00Z",
        },
        {
          chat_id: "c-2",
          content: "lone message",
          created_at: "2026-05-21T10:45:00Z",
        },
      ],
      error: null,
    });

    const list = await chats.listChats();

    expect(q.eqForSelect).toHaveBeenCalledWith("source", "conversational");
    expect(list).toHaveLength(2);
    const c1 = list.find((c) => c.id === "c-1")!;
    expect(c1.lastMessagePreview).toBe("later message");
    expect(c1.messageCount).toBe(2);
    const c2 = list.find((c) => c.id === "c-2")!;
    expect(c2.lastMessagePreview).toBe("lone message");
    expect(c2.messageCount).toBe(1);
  });

  it("listChats falls back when chats.source is missing", async () => {
    const { q, chats } = withClient();
    q.order
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: "column chats.source does not exist" },
      } as Awaited<ReturnType<typeof q.order>>)
      .mockResolvedValueOnce({
        data: [CHAT_ROW],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });

    const list = await chats.listChats();

    expect(q.eqForSelect).toHaveBeenCalledWith("source", "conversational");
    expect(q.order).toHaveBeenCalledTimes(3);
    expect(list).toEqual([
      {
        id: "c-1",
        title: null,
        createdAt: "2026-05-21T10:00:00Z",
        closedAt: null,
        extractedAt: null,
        lastMessagePreview: null,
        lastMessageAt: null,
        messageCount: 0,
      },
    ]);
  });

  it("appendMessage refuses when the parent chat is closed", async () => {
    const { q, chats } = withClient();
    q.single.mockResolvedValueOnce({
      data: { ...CHAT_ROW, closed_at: "2026-05-21T11:00:00Z" },
      error: null,
    });

    await expect(
      chats.appendMessage({
        chatId: "c-1",
        role: "user",
        content: "hi",
      }),
    ).rejects.toThrow(/closed/);

    expect(q.insert).not.toHaveBeenCalled();
  });

  it("appendMessage inserts on an open chat and returns the typed message", async () => {
    const { q, chats } = withClient();
    q.single
      .mockResolvedValueOnce({ data: CHAT_ROW, error: null })
      .mockResolvedValueOnce({
        data: {
          id: "m-1",
          chat_id: "c-1",
          role: "user",
          content: "hi",
          tool_calls: null,
          tool_call_id: null,
          created_at: "2026-05-21T11:00:00Z",
        },
        error: null,
      });

    const msg = await chats.appendMessage({
      chatId: "c-1",
      role: "user",
      content: "hi",
    });

    expect(q.insert).toHaveBeenCalledWith({
      chat_id: "c-1",
      role: "user",
      content: "hi",
      tool_calls: null,
      tool_call_id: null,
    });
    expect(msg.role).toBe("user");
    expect(msg.toolCalls).toBeNull();
  });

  it("closeChat is a no-op on already-closed chats", async () => {
    const { q, chats } = withClient();
    q.single.mockResolvedValueOnce({
      data: { ...CHAT_ROW, closed_at: "2026-05-21T11:00:00Z" },
      error: null,
    });

    const result = await chats.closeChat("c-1");

    expect(result.closedAt).toBe("2026-05-21T11:00:00Z");
    expect(q.update).not.toHaveBeenCalled();
  });

  it("respond invokes chat-respond and returns the assistant message", async () => {
    const { q, chats } = withClient();
    q.invoke.mockResolvedValueOnce({
      data: {
        message: {
          id: "m-2",
          chat_id: "c-1",
          role: "assistant",
          content: "Hi there.",
          tool_calls: [
            {
              id: "tu_1",
              name: "list_relationships",
              input: {},
              result_preview: "[]",
            },
          ],
          tool_call_id: null,
          created_at: "2026-05-21T11:01:00Z",
        },
      },
      error: null,
    });

    const msg = await chats.respond("c-1");

    expect(q.invoke).toHaveBeenCalledWith("chat-respond", {
      body: { chatId: "c-1" },
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Hi there.");
    expect(msg.toolCalls).toHaveLength(1);
  });

  it("respond throws on Edge Function error", async () => {
    const { q, chats } = withClient();
    q.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "rate limited" },
    });

    await expect(chats.respond("c-1")).rejects.toThrow(/rate limited/);
  });

  it("respondStream yields text_delta and done events from an SSE response", async () => {
    const fetchImpl = jest.fn(async () =>
      sseResponse([
        'event: text_delta\ndata: {"delta":"Hello"}\n\n',
        'event: text_delta\ndata: {"delta":" there."}\n\n',
        'event: done\ndata: {"message":{"id":"m-2","chat_id":"c-1","role":"assistant","content":"Hello there.","tool_calls":null,"tool_call_id":null,"created_at":"2026-05-21T11:00:00Z"}}\n\n',
      ]),
    );
    const { chats } = withClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      functionsUrl: "https://example.supabase.co/functions/v1",
      accessToken: "tk",
    });

    const events = [];
    for await (const e of chats.respondStream("c-1")) {
      events.push(e);
    }

    expect(events.map((e) => e.type)).toEqual([
      "text_delta",
      "text_delta",
      "done",
    ]);
    expect((events[0] as { delta: string }).delta).toBe("Hello");
    expect((events[2] as { message: { content: string } }).message.content).toBe(
      "Hello there.",
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/chat-respond",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tk",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ chatId: "c-1" }),
      }),
    );
  });

  it("respondStream surfaces tool_use and tool_result events with their fields", async () => {
    const fetchImpl = jest.fn(async () =>
      sseResponse([
        'event: tool_use\ndata: {"id":"tu_1","name":"list_relationships","input":{}}\n\n',
        'event: tool_result\ndata: {"id":"tu_1","preview":"[{\\"name\\":\\"Sam\\"}]"}\n\n',
        'event: text_delta\ndata: {"delta":"You have 1."}\n\n',
        'event: done\ndata: {"message":{"id":"m-3","chat_id":"c-1","role":"assistant","content":"You have 1.","tool_calls":null,"tool_call_id":null,"created_at":"t"}}\n\n',
      ]),
    );
    const { chats } = withClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      functionsUrl: "https://example.supabase.co/functions/v1",
      accessToken: "tk",
    });

    const events = [];
    for await (const e of chats.respondStream("c-1")) {
      events.push(e);
    }

    expect(events.map((e) => e.type)).toEqual([
      "tool_use",
      "tool_result",
      "text_delta",
      "done",
    ]);
    const toolUse = events[0] as Extract<
      (typeof events)[number],
      { type: "tool_use" }
    >;
    expect(toolUse.id).toBe("tu_1");
    expect(toolUse.name).toBe("list_relationships");
    const toolResult = events[1] as Extract<
      (typeof events)[number],
      { type: "tool_result" }
    >;
    expect(toolResult.id).toBe("tu_1");
    expect(toolResult.preview).toBe('[{"name":"Sam"}]');
  });

  it("respondStream yields a single error event when the function returns non-2xx", async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain" },
        }),
    );
    const { chats } = withClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      functionsUrl: "https://example.supabase.co/functions/v1",
      accessToken: "tk",
    });

    const events = [];
    for await (const e of chats.respondStream("c-1")) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect((events[0] as { message: string }).message).toMatch(/429/);
  });

  it("extract invokes extract-context and returns the result", async () => {
    const { q, chats } = withClient();
    q.invoke.mockResolvedValueOnce({
      data: {
        ok: true,
        extracted_at: "2026-05-21T12:00:00Z",
        notesLogged: 1,
        interactionsLogged: 2,
        commsLogged: 0,
        commitmentsOpened: 1,
        toolErrors: [],
      },
      error: null,
    });

    const result = await chats.extract("c-1");

    expect(q.invoke).toHaveBeenCalledWith("extract-context", {
      body: { chatId: "c-1" },
    });
    expect(result).toEqual({
      ok: true,
      extracted_at: "2026-05-21T12:00:00Z",
      notesLogged: 1,
      interactionsLogged: 2,
      commsLogged: 0,
      commitmentsOpened: 1,
      toolErrors: [],
    });
  });
});
