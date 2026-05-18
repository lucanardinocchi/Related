import type { SupabaseClient } from "@supabase/supabase-js";
import { CandidatesClient } from "./CandidatesClient";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  // Chain: .from('candidate_sets').select(cols).eq(...).order(...).limit(1)
  const limit = jest.fn<Promise<Resolved<unknown>>, []>();
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn((_t: string) => ({ select }));
  return { from, select, eq, order, limit };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return { q, client: new CandidatesClient(supa) };
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
      actions: [
        {
          id: "ca-1",
          type: "DoNothing",
          payload: null,
          why: "no changes warrant a Candidate Action this Pass",
          decisionState: "pending",
        },
      ],
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
