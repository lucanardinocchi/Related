import type { SupabaseClient } from "@supabase/supabase-js";
import { CandidatesClient } from "./CandidatesClient";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  // Chain: .from('candidate_sets').select(cols).eq(...).order(...).limit(1)
  const limit = jest.fn<Promise<Resolved<unknown>>, []>();
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq, order }));
  const from = jest.fn((_t: string) => ({ select }));
  return { from, select, eq, order, limit };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return { q, client: new CandidatesClient(supa) };
}

function withListClient(resolved: Resolved<unknown>) {
  const order = jest.fn<Promise<Resolved<unknown>>, []>().mockResolvedValue(resolved);
  const select = jest.fn(() => ({ order }));
  const from = jest.fn((_t: string) => ({ select }));
  const supa = { from } as unknown as SupabaseClient;
  return { from, select, order, client: new CandidatesClient(supa) };
}

describe("CandidatesClient.getLatestForRelationship", () => {
  it("returns the most-recent Candidate Set with its pending actions, hydrated", async () => {
    const { q, client } = withClient();
    q.limit.mockResolvedValue({
      data: [
        {
          id: "cs-1",
          relationship_id: "r-1",
          mode: "baseline",
          created_at: "2026-05-19T00:00:00Z",
          candidate_actions: [
            {
              id: "ca-1",
              type: "DoNothing",
              payload: null,
              why: "no changes warrant a Candidate Action this Pass",
              decision_state: "pending",
            },
          ],
        },
      ],
      error: null,
    });

    const set = await client.getLatestForRelationship("r-1");

    expect(set).toEqual({
      id: "cs-1",
      relationshipId: "r-1",
      mode: "baseline",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [],
    });
    expect(q.from).toHaveBeenCalledWith("candidate_sets");
    expect(q.eq).toHaveBeenCalledWith("relationship_id", "r-1");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns null when the Relationship has never had a Pass run", async () => {
    const { q, client } = withClient();
    q.limit.mockResolvedValue({ data: [], error: null });

    await expect(client.getLatestForRelationship("r-1")).resolves.toBeNull();
  });
});

describe("CandidatesClient.listPendingForUser", () => {
  it("returns pending actions from each relationship's latest set, excluding DoNothing", async () => {
    const { from, select, order, client } = withListClient({
      data: [
        {
          id: "cs-new",
          relationship_id: "r-1",
          mode: "triggered",
          created_at: "2026-05-20T00:00:00Z",
          candidate_actions: [
            {
              id: "ca-open",
              type: "OpenThread",
              payload: { summary: "Follow up on intro" },
              why: "They asked for an intro last week",
              decision_state: "pending",
            },
            {
              id: "ca-old-pending",
              type: "SendMessage",
              payload: { channel: "text", body: "stale" },
              why: "old suggestion",
              decision_state: "pending",
            },
          ],
        },
        {
          id: "cs-old",
          relationship_id: "r-1",
          mode: "baseline",
          created_at: "2026-05-19T00:00:00Z",
          candidate_actions: [
            {
              id: "ca-stale",
              type: "SendMessage",
              payload: { channel: "text", body: "ignore me" },
              why: "from an older pass",
              decision_state: "pending",
            },
          ],
        },
        {
          id: "cs-2",
          relationship_id: "r-2",
          mode: "baseline",
          created_at: "2026-05-18T00:00:00Z",
          candidate_actions: [
            {
              id: "ca-decided",
              type: "SendMessage",
              payload: { channel: "email", body: "done" },
              why: "already handled",
              decision_state: "picked",
            },
            {
              id: "ca-nothing",
              type: "DoNothing",
              payload: null,
              why: "all good",
              decision_state: "pending",
            },
          ],
        },
      ],
      error: null,
    });

    const pending = await client.listPendingForUser();

    expect(pending).toEqual([
      {
        action: {
          id: "ca-open",
          type: "OpenThread",
          payload: { summary: "Follow up on intro" },
          why: "They asked for an intro last week",
          decisionState: "pending",
        },
        candidateSetId: "cs-new",
        relationshipId: "r-1",
        passMode: "triggered",
        setCreatedAt: "2026-05-20T00:00:00Z",
      },
      {
        action: {
          id: "ca-old-pending",
          type: "SendMessage",
          payload: { channel: "text", body: "stale" },
          why: "old suggestion",
          decisionState: "pending",
        },
        candidateSetId: "cs-new",
        relationshipId: "r-1",
        passMode: "triggered",
        setCreatedAt: "2026-05-20T00:00:00Z",
      },
    ]);
    expect(from).toHaveBeenCalledWith("candidate_sets");
    expect(select).toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
