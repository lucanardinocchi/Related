import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MessagesClient,
  normalizePhone,
} from "./MessagesClient";

type Resolved<T> = Promise<
  { data: T; error: null } | { data: null; error: { message: string } }
>;

type InsertResult =
  | { data: null; error: null }
  | { data: null; error: { message: string; code?: string } };

function makeQueryMock() {
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn<Resolved<unknown[]>, []>();
  const isSecond = jest.fn(() => ({ order }));
  const isFirst = jest.fn(() => ({ is: isSecond }));
  const eqForUpdate = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  const eqForList = jest.fn(() => ({ order }));
  const update = jest.fn(() => ({ eq: eqForUpdate }));
  const selectForList = jest.fn(() => ({ eq: eqForList, is: isFirst, order }));
  let insertResult: InsertResult = { data: null, error: null };
  const insert = jest.fn(() => ({
    select: jest.fn(() => ({ single })),
    then(
      onFulfilled?: (value: InsertResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(insertResult).then(onFulfilled, onRejected);
    },
  }));
  return {
    from: jest.fn((_table: string) => ({
      insert,
      select: selectForList,
      update,
    })),
    insert,
    setInsertResult(result: InsertResult) {
      insertResult = result;
    },
    single,
    order,
    eqForList,
    eqForUpdate,
    isFirst,
    isSecond,
    selectForList,
    update,
  };
}

function withClient() {
  const q = makeQueryMock();
  const getUser = jest.fn();
  const supa = {
    auth: { getUser },
    from: q.from,
  } as unknown as SupabaseClient;
  return { q, getUser, messages: new MessagesClient(supa) };
}

const THREAD_ROW = {
  id: "t-1",
  external_chat_id: "chat-1",
  external_chat_guid: "guid-1",
  is_group: false,
  display_name: "Sam",
  contact_id: "c-1",
  group_id: null,
  participant_handles: ["+61400000000"],
  last_message_at: "2026-05-22T10:00:00Z",
  created_at: "2026-05-22T09:00:00Z",
  updated_at: "2026-05-22T10:00:00Z",
};

const MESSAGE_ROW = {
  id: "m-1",
  thread_id: "t-1",
  external_message_id: "ext-1",
  direction: "inbound" as const,
  body: "Hey",
  sent_at: "2026-05-22T10:00:00Z",
  service: "iMessage",
  created_at: "2026-05-22T10:00:01Z",
};

const OUTBOUND_ROW = {
  id: "q-1",
  thread_id: "t-1",
  contact_id: null,
  group_id: null,
  body: "Reply",
  status: "pending" as const,
  error: null,
  created_at: "2026-05-22T10:05:00Z",
  sent_at: null,
};

describe("normalizePhone", () => {
  it("preserves a leading plus and strips other non-digits", () => {
    expect(normalizePhone("+61 400 000 000")).toBe("+61400000000");
  });

  it("strips non-digits when there is no leading plus", () => {
    expect(normalizePhone("(040) 000-0000")).toBe("0400000000");
  });
});

describe("MessagesClient.createPairingCode", () => {
  it("inserts a pairing code for the signed-in user", async () => {
    const { q, getUser, messages } = withClient();
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    q.setInsertResult({ data: null, error: null });

    const result = await messages.createPairingCode();

    expect(getUser).toHaveBeenCalled();
    expect(q.from).toHaveBeenCalledWith("relay_pairing_codes");
    expect(q.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "user-1",
        code: expect.stringMatching(/^[A-Z2-9]{8}$/),
        expires_at: expect.any(String),
      }),
    );
    expect(result.code).toHaveLength(8);
    expect(result.expiresAt).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });

  it("retries on duplicate pairing codes", async () => {
    const { q, getUser, messages } = withClient();
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    q.insert
      .mockImplementationOnce(() => ({
        select: jest.fn(),
        then(onFulfilled?: (value: InsertResult) => unknown) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate" },
          }).then(onFulfilled);
        },
      }))
      .mockImplementationOnce(() => ({
        select: jest.fn(),
        then(onFulfilled?: (value: InsertResult) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(onFulfilled);
        },
      }));

    await expect(messages.createPairingCode()).resolves.toEqual(
      expect.objectContaining({ code: expect.any(String) }),
    );
    expect(q.insert).toHaveBeenCalledTimes(2);
  });

  it("throws when the user is not signed in", async () => {
    const { getUser, messages } = withClient();
    getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(messages.createPairingCode()).rejects.toThrow("Not signed in");
  });

  it("throws when insert fails for a non-duplicate reason", async () => {
    const { q, getUser, messages } = withClient();
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    q.setInsertResult({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(messages.createPairingCode()).rejects.toMatchObject({
      message: "permission denied",
    });
  });
});

describe("MessagesClient.listRelayDevices", () => {
  it("maps last_seen_at to lastSeenAt", async () => {
    const { q, messages } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "d-1",
          name: "MacBook",
          last_seen_at: "2026-05-22T10:00:00Z",
          created_at: "2026-05-21T10:00:00Z",
        },
      ],
      error: null,
    });

    const devices = await messages.listRelayDevices();

    expect(q.from).toHaveBeenCalledWith("relay_devices");
    expect(devices).toEqual([
      {
        id: "d-1",
        name: "MacBook",
        lastSeenAt: "2026-05-22T10:00:00Z",
        createdAt: "2026-05-21T10:00:00Z",
      },
    ]);
  });
});

describe("MessagesClient.isRelayOnline", () => {
  it("returns true when a device was seen within 90 seconds", async () => {
    const { q, messages } = withClient();
    const recent = new Date(Date.now() - 30_000).toISOString();
    q.order.mockResolvedValue({
      data: [
        {
          id: "d-1",
          name: "Mac",
          last_seen_at: recent,
          created_at: "2026-05-21T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(messages.isRelayOnline()).resolves.toBe(true);
  });

  it("returns false when all devices are stale", async () => {
    const { q, messages } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "d-1",
          name: "Mac",
          last_seen_at: "2026-05-20T10:00:00Z",
          created_at: "2026-05-21T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(messages.isRelayOnline()).resolves.toBe(false);
  });
});

describe("MessagesClient.listThreadsForContact", () => {
  it("filters by contact_id", async () => {
    const { q, messages } = withClient();
    q.order.mockResolvedValue({ data: [THREAD_ROW], error: null });

    const threads = await messages.listThreadsForContact("c-1");

    expect(q.from).toHaveBeenCalledWith("message_threads");
    expect(q.eqForList).toHaveBeenCalledWith("contact_id", "c-1");
    expect(threads[0]?.contactId).toBe("c-1");
  });
});

describe("MessagesClient.listThreadsForGroup", () => {
  it("filters by group_id", async () => {
    const { q, messages } = withClient();
    q.order.mockResolvedValue({
      data: [{ ...THREAD_ROW, group_id: "g-1", contact_id: null, is_group: true }],
      error: null,
    });

    const threads = await messages.listThreadsForGroup("g-1");

    expect(q.eqForList).toHaveBeenCalledWith("group_id", "g-1");
    expect(threads[0]?.groupId).toBe("g-1");
  });
});

describe("MessagesClient.listUnlinkedThreads", () => {
  it("selects threads with null contact_id and group_id", async () => {
    const { q, messages } = withClient();
    q.order.mockResolvedValue({
      data: [{ ...THREAD_ROW, contact_id: null, group_id: null }],
      error: null,
    });

    await messages.listUnlinkedThreads();

    expect(q.isFirst).toHaveBeenCalledWith("contact_id", null);
    expect(q.isSecond).toHaveBeenCalledWith("group_id", null);
  });
});

describe("MessagesClient.listMessages", () => {
  it("orders messages by sent_at ascending", async () => {
    const { q, messages } = withClient();
    q.order.mockResolvedValue({ data: [MESSAGE_ROW], error: null });

    const result = await messages.listMessages("t-1");

    expect(q.from).toHaveBeenCalledWith("messages");
    expect(q.eqForList).toHaveBeenCalledWith("thread_id", "t-1");
    expect(q.order).toHaveBeenCalledWith("sent_at", { ascending: true });
    expect(result[0]).toEqual({
      id: "m-1",
      threadId: "t-1",
      externalMessageId: "ext-1",
      direction: "inbound",
      body: "Hey",
      sentAt: "2026-05-22T10:00:00Z",
      service: "iMessage",
      createdAt: "2026-05-22T10:00:01Z",
    });
  });
});

describe("MessagesClient.linkThread", () => {
  it("updates contact_id and group_id when provided", async () => {
    const { q, messages } = withClient();
    q.single.mockResolvedValue({
      data: { ...THREAD_ROW, contact_id: "c-2", group_id: "g-1" },
      error: null,
    });

    const thread = await messages.linkThread("t-1", {
      contactId: "c-2",
      groupId: "g-1",
    });

    expect(q.update).toHaveBeenCalledWith({
      contact_id: "c-2",
      group_id: "g-1",
    });
    expect(q.eqForUpdate).toHaveBeenCalledWith("id", "t-1");
    expect(thread.contactId).toBe("c-2");
    expect(thread.groupId).toBe("g-1");
  });
});

describe("MessagesClient.sendMessage", () => {
  it("inserts a pending outbound_queue row", async () => {
    const { q, messages } = withClient();
    q.single.mockResolvedValue({ data: OUTBOUND_ROW, error: null });

    const item = await messages.sendMessage({
      threadId: "t-1",
      body: "Reply",
    });

    expect(q.from).toHaveBeenCalledWith("outbound_queue");
    expect(q.insert).toHaveBeenCalledWith({
      thread_id: "t-1",
      contact_id: null,
      group_id: null,
      body: "Reply",
      status: "pending",
    });
    expect(item.status).toBe("pending");
  });

  it("requires threadId, contactId, or groupId", async () => {
    const { messages } = withClient();

    await expect(
      messages.sendMessage({ body: "Hello" }),
    ).rejects.toThrow("sendMessage requires threadId, contactId, or groupId");
  });
});
