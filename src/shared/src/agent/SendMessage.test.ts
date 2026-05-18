import type { SupabaseClient } from "@supabase/supabase-js";
import { Executor, type MessageComposer } from "./Executor";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const select = jest.fn(() => ({ single }));
  const eq = jest.fn(() => ({ single, select }));
  const update = jest.fn(() => ({ eq }));
  const topSelect = jest.fn(() => ({ eq }));
  const from = jest.fn((_t: string) => ({ update, select: topSelect }));
  const rpc = jest.fn<Promise<Resolved<unknown>>, [string, unknown]>();
  return { from, update, eq, single, select, topSelect, rpc };
}

function withExecutor(composer?: MessageComposer) {
  const q = makeQueryMock();
  const supa = { from: q.from, rpc: q.rpc } as unknown as SupabaseClient;
  const scheduleTriggeredPass = jest.fn().mockResolvedValue(undefined);
  const composeMock: MessageComposer =
    composer ?? { compose: jest.fn().mockResolvedValue(undefined) };
  const executor = new Executor({
    supabase: supa,
    scheduleTriggeredPass,
    messageComposer: composeMock,
  });
  return { q, executor, scheduleTriggeredPass, composer: composeMock };
}

function primeReads(q: ReturnType<typeof makeQueryMock>) {
  // 1) update().eq().select().single() → updated row
  // 2) candidate_sets.select().eq().single() → relationship lookup
  // 3) RPC create_interaction (for the auto-log) → returns the new id
  q.single
    .mockResolvedValueOnce({
      data: {
        id: "ca-1",
        owner_id: "u-1",
        candidate_set_id: "cs-1",
        type: "SendMessage",
        decision_state: "picked",
      },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { id: "cs-1", relationship_id: "r-1" },
      error: null,
    });
  q.rpc.mockResolvedValueOnce({ data: "i-new", error: null });
}

describe("Executor.execute — SendMessage (text)", () => {
  it("opens the SMS composer pre-filled, then auto-logs an `occurred` Interaction", async () => {
    const { q, executor, composer, scheduleTriggeredPass } = withExecutor();
    primeReads(q);

    const result = await executor.execute({
      action: {
        id: "ca-1",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "SendMessage",
        payload: {
          channel: "text",
          to: ["+61400000000"],
          body: "Hey Sam, coffee Friday?",
          contactIds: ["c-sam"],
        },
      },
    });

    expect(result.kind).toBe("picked");
    expect(composer.compose).toHaveBeenCalledWith({
      channel: "text",
      to: ["+61400000000"],
      body: "Hey Sam, coffee Friday?",
    });
    // Records the decision as picked (not declined like DoNothing).
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ decision_state: "picked" }),
    );
    // Auto-logs an `occurred` Interaction of kind 'text' linked to the
    // recipient Contact(s).
    expect(q.rpc).toHaveBeenCalledWith(
      "create_interaction",
      expect.objectContaining({
        p_kind: "text",
        p_status: "occurred",
        p_contact_ids: ["c-sam"],
      }),
    );
    // The Triggered Pass still fires so the agent sees the new Interaction.
    expect(scheduleTriggeredPass).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipId: "r-1" }),
    );
  });
});

describe("Executor.execute — SendMessage (email)", () => {
  it("opens the email composer with subject + body, then auto-logs kind='email'", async () => {
    const { q, executor, composer } = withExecutor();
    primeReads(q);

    await executor.execute({
      action: {
        id: "ca-2",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "SendMessage",
        payload: {
          channel: "email",
          to: ["sam@example.com"],
          subject: "Coffee Friday?",
          body: "Hey Sam, free Friday morning?",
          contactIds: ["c-sam"],
        },
      },
    });

    expect(composer.compose).toHaveBeenCalledWith({
      channel: "email",
      to: ["sam@example.com"],
      subject: "Coffee Friday?",
      body: "Hey Sam, free Friday morning?",
    });
    expect(q.rpc).toHaveBeenCalledWith(
      "create_interaction",
      expect.objectContaining({ p_kind: "email" }),
    );
  });

  it("honours user edits to body and recipients before launching the composer", async () => {
    const { q, executor, composer } = withExecutor();
    primeReads(q);

    await executor.execute({
      action: {
        id: "ca-3",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "SendMessage",
        payload: {
          channel: "email",
          to: ["sam@example.com"],
          subject: "Coffee?",
          body: "draft from agent",
          contactIds: ["c-sam"],
        },
      },
      userEdits: {
        payload: {
          channel: "email",
          to: ["sam@example.com", "jules@example.com"],
          subject: "Coffee Friday?",
          body: "User-edited body",
          contactIds: ["c-sam", "c-jules"],
        },
      },
    });

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["sam@example.com", "jules@example.com"],
        body: "User-edited body",
      }),
    );
    expect(q.rpc).toHaveBeenCalledWith(
      "create_interaction",
      expect.objectContaining({
        p_contact_ids: ["c-sam", "c-jules"],
      }),
    );
  });
});
