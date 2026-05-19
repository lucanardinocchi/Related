import type { SupabaseClient } from "@supabase/supabase-js";
import { UserProviderTokensClient } from "./UserProviderTokensClient";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeMock() {
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const eqInner = jest.fn(() => ({ single, maybeSingle }));
  const eq = jest.fn(() => ({ single, maybeSingle, eq: eqInner }));
  const select = jest.fn(() => ({ eq }));
  const upsertSelect = jest.fn(() => ({ single }));
  const upsert = jest.fn(() => ({ select: upsertSelect }));
  const from = jest.fn(() => ({ select, upsert }));
  return { from, select, eq, eqInner, single, maybeSingle, upsert, upsertSelect };
}

function withClient() {
  const q = makeMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  const ownerId = async () => "u-1";
  const client = new UserProviderTokensClient(supa, ownerId);
  return { q, client };
}

describe("UserProviderTokensClient.upsert", () => {
  it("writes the access token + refresh token + scopes for the current User scoped to the provider", async () => {
    const { q, client } = withClient();
    q.single.mockResolvedValueOnce({
      data: {
        owner_id: "u-1",
        provider: "google",
        access_token: "at-1",
        refresh_token: "rt-1",
      },
      error: null,
    });

    await client.upsert({
      provider: "google",
      accessToken: "at-1",
      refreshToken: "rt-1",
      scopes: "https://www.googleapis.com/auth/calendar.readonly",
      expiresAt: "2026-05-19T05:00:00Z",
    });

    expect(q.from).toHaveBeenCalledWith("user_provider_tokens");
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "u-1",
        provider: "google",
        access_token: "at-1",
        refresh_token: "rt-1",
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        expires_at: "2026-05-19T05:00:00Z",
      }),
      expect.objectContaining({ onConflict: "owner_id,provider" }),
    );
  });
});

describe("UserProviderTokensClient.getForProvider", () => {
  it("returns the row when one exists", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValueOnce({
      data: {
        owner_id: "u-1",
        provider: "google",
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_at: "2026-05-19T05:00:00Z",
        scopes: "calendar.readonly",
      },
      error: null,
    });
    const got = await client.getForProvider("google");
    expect(got?.accessToken).toBe("at-1");
    expect(got?.refreshToken).toBe("rt-1");
  });

  it("returns null when there is no row for the provider", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const got = await client.getForProvider("google");
    expect(got).toBeNull();
  });
});
