import type { SupabaseClient } from "@supabase/supabase-js";
import { OpenThreadsClient } from "./OpenThreadsClient";

type Resolved<T> = Promise<{ data: T; error: null } | { data: null; error: { message: string } }>;

/**
 * Thin mock of the postgrest query-builder shape OpenThreadsClient drives.
 * Each test wires the chain it needs — the mock only records the call.
 *
 * Post-ADR-0008 the chains are richer (the "open threads" methods filter
 * `closed_at IS NULL` with `.is(...)`), so tests build per-call chains via
 * `q.select` mock overrides rather than relying on one universal chain.
 */
function makeQueryMock() {
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn<Resolved<unknown>, []>();
  const update = jest.fn(() => ({ eq }));
  const eq = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  const select = jest.fn(() => ({ order, eq }));
  const from = jest.fn((_table: string) => ({ select, update }));
  const rpc = jest.fn();
  return { from, select, order, eq, single, update, rpc };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from, rpc: q.rpc } as unknown as SupabaseClient;
  return { q, client: new OpenThreadsClient(supa) };
}

const NULL_COMMITMENT = {
  origin: null,
  communication_status: "not_communicated" as const,
  why_helps_person: null,
  why_i_can_help: null,
};

const NULL_COMMITMENT_CAMEL = {
  origin: null,
  communicationStatus: "not_communicated" as const,
  whyHelpsPerson: null,
  whyICanHelp: null,
};

describe("OpenThreadsClient.createOpenThread", () => {
  it("calls the create_open_thread RPC and returns the inserted id", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({ data: "ot-1", error: null });

    const id = await client.createOpenThread({
      description: "owe Sam a coffee",
      direction: "me_owes_them",
      relationshipIds: ["r-1", "r-2"],
    });

    expect(id).toBe("ot-1");
    expect(q.rpc).toHaveBeenCalledWith("create_open_thread", {
      p_description: "owe Sam a coffee",
      p_direction: "me_owes_them",
      p_relationship_ids: ["r-1", "r-2"],
    });
  });

  it("throws when the RPC errors", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({
      data: null,
      error: { message: "row violates RLS" },
    });

    await expect(
      client.createOpenThread({
        description: "x",
        direction: "they_owe_me",
        relationshipIds: ["r-1"],
      }),
    ).rejects.toMatchObject({ message: "row violates RLS" });
  });
});

describe("OpenThreadsClient.updateOpenThread", () => {
  it("updates description and returns the full OpenThread with links", async () => {
    const { q, client } = withClient();
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "ot-1",
        description: "revised wording",
        direction: "me_owes_them",
        ...NULL_COMMITMENT,
        created_at: "2026-04-01T10:00:00Z",
        closed_at: null,
        open_thread_relationships: [
          { relationship_id: "r-1" },
          { relationship_id: "r-2" },
        ],
      },
      error: null,
    });
    const selectInner = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select: selectInner }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    const updated = await client.updateOpenThread("ot-1", {
      description: "revised wording",
    });

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(q.update).toHaveBeenCalledWith({ description: "revised wording" });
    expect(eq).toHaveBeenCalledWith("id", "ot-1");
    expect(updated).toEqual({
      id: "ot-1",
      description: "revised wording",
      direction: "me_owes_them",
      ...NULL_COMMITMENT_CAMEL,
      createdAt: "2026-04-01T10:00:00Z",
      closedAt: null,
      relationshipIds: ["r-1", "r-2"],
    });
  });

  it("throws when RLS rejects the write", async () => {
    const { q, client } = withClient();
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "row violates RLS" },
    });
    const selectInner = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select: selectInner }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    await expect(
      client.updateOpenThread("ot-other", { description: "nope" }),
    ).rejects.toMatchObject({ message: "row violates RLS" });
  });
});

describe("OpenThreadsClient.closeOpenThread", () => {
  it("updates closed_at on the thread by id and returns void", async () => {
    const { q, client } = withClient();
    const select = jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: { id: "ot-1" }, error: null }) }));
    const eq = jest.fn(() => ({ select }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    await client.closeOpenThread("ot-1");

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ closed_at: expect.any(String) }),
    );
    expect(eq).toHaveBeenCalledWith("id", "ot-1");
  });
});

describe("OpenThreadsClient.listOpenForUser", () => {
  it("filters closed_at IS NULL and returns open threads with commitment meta, oldest-first", async () => {
    const { q, client } = withClient();
    // listOpenForUser chain:
    // from("open_threads").select(cols).is("closed_at", null).order(...)
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: "ot-old",
          description: "ancient owed reply",
          direction: "me_owes_them",
          ...NULL_COMMITMENT,
          created_at: "2026-04-01T10:00:00Z",
          closed_at: null,
          open_thread_relationships: [
            { relationship_id: "r-1" },
            { relationship_id: "r-2" },
          ],
        },
        {
          id: "ot-new",
          description: "fresh thread",
          direction: "they_owe_me",
          ...NULL_COMMITMENT,
          created_at: "2026-05-01T10:00:00Z",
          closed_at: null,
          open_thread_relationships: [{ relationship_id: "r-3" }],
        },
      ],
      error: null,
    });
    const is = jest.fn(() => ({ order }));
    q.select.mockReturnValueOnce({ is } as unknown as ReturnType<typeof q.select>);

    const threads = await client.listOpenForUser();

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(is).toHaveBeenCalledWith("closed_at", null);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(threads).toEqual([
      {
        id: "ot-old",
        description: "ancient owed reply",
        direction: "me_owes_them",
        ...NULL_COMMITMENT_CAMEL,
        createdAt: "2026-04-01T10:00:00Z",
        closedAt: null,
        relationshipIds: ["r-1", "r-2"],
      },
      {
        id: "ot-new",
        description: "fresh thread",
        direction: "they_owe_me",
        ...NULL_COMMITMENT_CAMEL,
        createdAt: "2026-05-01T10:00:00Z",
        closedAt: null,
        relationshipIds: ["r-3"],
      },
    ]);
  });

  it("returns [] when the User has no open threads", async () => {
    const { q, client } = withClient();
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const is = jest.fn(() => ({ order }));
    q.select.mockReturnValueOnce({ is } as unknown as ReturnType<typeof q.select>);

    await expect(client.listOpenForUser()).resolves.toEqual([]);
  });
});

describe("OpenThreadsClient.listOpenForRelationship", () => {
  it("filters open threads to those linked to a given relationship, only open, oldest-first", async () => {
    const { q, client } = withClient();
    // Chain: from("open_thread_relationships").select(...)
    //          .eq("relationship_id", id).is("open_threads.closed_at", null)
    //          .order("open_threads(created_at)", ...)
    const innerOrder = jest.fn().mockResolvedValue({
      data: [
        {
          open_threads: {
            id: "ot-1",
            description: "owed",
            direction: "me_owes_them",
            ...NULL_COMMITMENT,
            created_at: "2026-04-01T10:00:00Z",
            closed_at: null,
            open_thread_relationships: [{ relationship_id: "r-7" }],
          },
        },
      ],
      error: null,
    });
    const is = jest.fn(() => ({ order: innerOrder }));
    const eq = jest.fn(() => ({ is }));
    q.select.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.select>);

    const result = await client.listOpenForRelationship("r-7");

    expect(q.from).toHaveBeenCalledWith("open_thread_relationships");
    expect(eq).toHaveBeenCalledWith("relationship_id", "r-7");
    expect(is).toHaveBeenCalledWith("open_threads.closed_at", null);
    expect(innerOrder).toHaveBeenCalledWith("open_threads(created_at)", {
      ascending: true,
    });
    expect(result).toEqual([
      {
        id: "ot-1",
        description: "owed",
        direction: "me_owes_them",
        ...NULL_COMMITMENT_CAMEL,
        createdAt: "2026-04-01T10:00:00Z",
        closedAt: null,
        relationshipIds: ["r-7"],
      },
    ]);
  });
});

describe("OpenThreadsClient.listCommitmentsForUser", () => {
  it("scopes to direction=me_owes_them, closed_at IS NULL, oldest-first", async () => {
    const { q, client } = withClient();
    // Chain: from(t).select(cols).eq("direction", "me_owes_them")
    //          .is("closed_at", null).order(...)
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const is = jest.fn(() => ({ order }));
    const eq = jest.fn(() => ({ is }));
    q.select.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.select>);

    await client.listCommitmentsForUser();

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(eq).toHaveBeenCalledWith("direction", "me_owes_them");
    expect(is).toHaveBeenCalledWith("closed_at", null);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("applies optional origin and communicationStatus filters", async () => {
    const { q, client } = withClient();
    // Chain: from(t).select(cols).eq(direction).is(closed).eq(origin).eq(status).order(...)
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const eqStatus = jest.fn(() => ({ order }));
    const eqOrigin = jest.fn(() => ({ eq: eqStatus }));
    const is = jest.fn(() => ({ eq: eqOrigin }));
    const eqDirection = jest.fn(() => ({ is }));
    q.select.mockReturnValueOnce({ eq: eqDirection } as unknown as ReturnType<typeof q.select>);

    await client.listCommitmentsForUser({
      origin: "self_led",
      communicationStatus: "confirmed",
    });

    expect(eqDirection).toHaveBeenCalledWith("direction", "me_owes_them");
    expect(eqOrigin).toHaveBeenCalledWith("origin", "self_led");
    expect(eqStatus).toHaveBeenCalledWith("communication_status", "confirmed");
  });
});

describe("OpenThreadsClient.setCommitmentMeta", () => {
  it("updates only the fields the caller passed", async () => {
    const { q, client } = withClient();
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "ot-1",
        description: "self-led one",
        direction: "me_owes_them",
        origin: "self_led",
        communication_status: "confirmed",
        why_helps_person: null,
        why_i_can_help: null,
        created_at: "2026-04-01T10:00:00Z",
        closed_at: null,
        open_thread_relationships: [{ relationship_id: "r-1" }],
      },
      error: null,
    });
    const selectInner = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select: selectInner }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    const updated = await client.setCommitmentMeta("ot-1", {
      origin: "self_led",
      communicationStatus: "confirmed",
    });

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(q.update).toHaveBeenCalledWith({
      origin: "self_led",
      communication_status: "confirmed",
    });
    expect(eq).toHaveBeenCalledWith("id", "ot-1");
    expect(updated.origin).toBe("self_led");
    expect(updated.communicationStatus).toBe("confirmed");
  });

  it("maps whyHelpsPerson / whyICanHelp to snake-case columns and accepts null clears", async () => {
    const { q, client } = withClient();
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "ot-2",
        description: "the context one",
        direction: "me_owes_them",
        origin: null,
        communication_status: "not_communicated",
        why_helps_person: "they want to learn",
        why_i_can_help: null,
        created_at: "2026-04-01T10:00:00Z",
        closed_at: null,
        open_thread_relationships: [{ relationship_id: "r-1" }],
      },
      error: null,
    });
    const selectInner = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select: selectInner }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    const updated = await client.setCommitmentMeta("ot-2", {
      whyHelpsPerson: "they want to learn",
      whyICanHelp: null,
    });

    expect(q.update).toHaveBeenCalledWith({
      why_helps_person: "they want to learn",
      why_i_can_help: null,
    });
    expect(updated.whyHelpsPerson).toBe("they want to learn");
    expect(updated.whyICanHelp).toBeNull();
  });
});

describe("OpenThreadsClient.setOpenThreadRelationships", () => {
  it("calls the RPC then re-reads and returns the hydrated thread", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValueOnce({ data: null, error: null });

    const single = jest.fn().mockResolvedValue({
      data: {
        id: "ot-3",
        description: "reassigned",
        direction: "me_owes_them",
        origin: null,
        communication_status: "not_communicated",
        why_helps_person: null,
        why_i_can_help: null,
        created_at: "2026-04-01T10:00:00Z",
        closed_at: null,
        open_thread_relationships: [{ relationship_id: "r-new" }],
      },
      error: null,
    });
    const eq = jest.fn(() => ({ single }));
    q.select.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.select>);

    const updated = await client.setOpenThreadRelationships("ot-3", ["r-new"]);

    expect(q.rpc).toHaveBeenCalledWith("set_open_thread_relationships", {
      p_open_thread_id: "ot-3",
      p_relationship_ids: ["r-new"],
    });
    expect(q.from).toHaveBeenLastCalledWith("open_threads");
    expect(eq).toHaveBeenCalledWith("id", "ot-3");
    expect(updated.relationshipIds).toEqual(["r-new"]);
  });

  it("throws when the RPC errors (e.g. empty relationship list)", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "at least one relationship required" },
    });

    await expect(
      client.setOpenThreadRelationships("ot-3", []),
    ).rejects.toMatchObject({ message: "at least one relationship required" });
  });
});

describe("OpenThreadsClient.closedPerDay", () => {
  it("calls the closed_threads_per_day RPC and shapes the rows", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({
      data: [
        { day: "2026-05-01", count: 0 },
        { day: "2026-05-02", count: 3 },
        { day: "2026-05-03", count: 1 },
      ],
      error: null,
    });

    const buckets = await client.closedPerDay({
      from: "2026-05-01",
      to: "2026-05-03",
    });

    expect(q.rpc).toHaveBeenCalledWith("closed_threads_per_day", {
      p_from: "2026-05-01",
      p_to: "2026-05-03",
    });
    expect(buckets).toEqual([
      { date: "2026-05-01", count: 0 },
      { date: "2026-05-02", count: 3 },
      { date: "2026-05-03", count: 1 },
    ]);
  });

  it("throws when the RPC errors", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({ data: null, error: { message: "nope" } });

    await expect(
      client.closedPerDay({ from: "2026-05-01", to: "2026-05-02" }),
    ).rejects.toMatchObject({ message: "nope" });
  });
});
