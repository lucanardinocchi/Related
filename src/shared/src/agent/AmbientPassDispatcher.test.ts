import type { SupabaseClient } from "@supabase/supabase-js";
import { AmbientPassDispatcher } from "./AmbientPassDispatcher";
import type { PassEngine } from "./PassEngine";

function makeSupabaseMock(
  overrides: {
    pending?: Array<{
      id: string;
      relationship_id: string;
      mode: string;
      reason: string;
      created_at: string;
    }>;
    subscriptionStatus?: string;
    ambientEnabled?: boolean | null;
    accountCreatedAt?: string;
    rpcError?: { message: string } | null;
  } = {},
) {
  const rpc = jest.fn().mockResolvedValue({ error: overrides.rpcError ?? null });
  const pendingLimit = jest.fn().mockResolvedValue({
    data: overrides.pending ?? [],
    error: null,
  });
  const pendingOrder = jest.fn(() => ({ limit: pendingLimit }));
  const pendingIn = jest.fn(() => ({ order: pendingOrder }));
  const pendingIs = jest.fn(() => ({ in: pendingIn }));
  const pendingSelect = jest.fn(() => ({ is: pendingIs }));

  const subMaybeSingle = jest.fn().mockResolvedValue({
    data: overrides.subscriptionStatus
      ? { status: overrides.subscriptionStatus }
      : null,
    error: null,
  });
  const subSelect = jest.fn(() => ({ maybeSingle: subMaybeSingle }));

  const prefsMaybeSingle = jest.fn().mockResolvedValue({
    data:
      overrides.ambientEnabled === undefined ||
      overrides.ambientEnabled === null
        ? null
        : { enabled: overrides.ambientEnabled },
    error: null,
  });
  const prefsSelect = jest.fn(() => ({ maybeSingle: prefsMaybeSingle }));

  const from = jest.fn((table: string) => {
    if (table === "scheduled_passes") {
      return { select: pendingSelect };
    }
    if (table === "user_subscriptions") {
      return { select: subSelect };
    }
    if (table === "ambient_intelligence_preferences") {
      return { select: prefsSelect };
    }
    throw new Error(`unexpected table ${table}`);
  });

  const createdAt =
    overrides.accountCreatedAt ?? "2020-01-01T00:00:00.000Z";

  return {
    supabase: {
      from,
      rpc,
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "u-1", created_at: createdAt } },
        }),
      },
    } as unknown as SupabaseClient,
    rpc,
    runPass: jest.fn(),
  };
}

describe("AmbientPassDispatcher", () => {
  test("returns null without an active subscription after the trial", async () => {
    const { supabase, runPass } = makeSupabaseMock({
      pending: [
        {
          id: "p-1",
          relationship_id: "r-1",
          mode: "baseline",
          reason: "baseline_schedule",
          created_at: "2026-05-19T00:00:00Z",
        },
      ],
      subscriptionStatus: "inactive",
    });
    const engine = { runPass } as unknown as PassEngine;
    const dispatcher = new AmbientPassDispatcher({ supabase, passEngine: engine });

    await expect(dispatcher.dispatchNextPendingPass()).resolves.toBeNull();
    expect(runPass).not.toHaveBeenCalled();
  });

  test("runs during the free trial without a subscription", async () => {
    const { supabase, rpc, runPass } = makeSupabaseMock({
      pending: [
        {
          id: "p-trial",
          relationship_id: "r-1",
          mode: "baseline",
          reason: "baseline_schedule",
          created_at: "2026-05-19T00:00:00Z",
        },
      ],
      subscriptionStatus: "inactive",
      accountCreatedAt: new Date().toISOString(),
    });
    runPass.mockResolvedValue({
      id: "cs-trial",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "baseline",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [],
    });
    const engine = { runPass } as unknown as PassEngine;
    const dispatcher = new AmbientPassDispatcher({ supabase, passEngine: engine });

    const result = await dispatcher.dispatchNextPendingPass();
    expect(result?.id).toBe("cs-trial");
    expect(runPass).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("complete_scheduled_pass", {
      p_pass_id: "p-trial",
    });
  });

  test("returns null when Ambient Intelligence is turned off", async () => {
    const { supabase, runPass } = makeSupabaseMock({
      pending: [
        {
          id: "p-1",
          relationship_id: "r-1",
          mode: "baseline",
          reason: "baseline_schedule",
          created_at: "2026-05-19T00:00:00Z",
        },
      ],
      subscriptionStatus: "active",
      ambientEnabled: false,
    });
    const engine = { runPass } as unknown as PassEngine;
    const dispatcher = new AmbientPassDispatcher({ supabase, passEngine: engine });

    await expect(dispatcher.dispatchNextPendingPass()).resolves.toBeNull();
    expect(runPass).not.toHaveBeenCalled();
  });

  test("runs one pass and completes the scheduled row", async () => {
    const { supabase, rpc, runPass } = makeSupabaseMock({
      pending: [
        {
          id: "p-1",
          relationship_id: "r-1",
          mode: "triggered",
          reason: "interaction_inserted",
          created_at: "2026-05-19T00:00:00Z",
        },
      ],
      subscriptionStatus: "active",
    });
    runPass.mockResolvedValue({
      id: "cs-1",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "triggered",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [{ type: "DoNothing" }],
    });
    const engine = { runPass } as unknown as PassEngine;
    const dispatcher = new AmbientPassDispatcher({ supabase, passEngine: engine });

    const result = await dispatcher.dispatchNextPendingPass();
    expect(result?.id).toBe("cs-1");
    expect(runPass).toHaveBeenCalledWith({
      relationshipId: "r-1",
      mode: "triggered",
    });
    expect(rpc).toHaveBeenCalledWith("complete_scheduled_pass", {
      p_pass_id: "p-1",
    });
  });

  test("uses custom completePass hook for service-role dispatch", async () => {
    const { supabase, runPass } = makeSupabaseMock({
      pending: [
        {
          id: "p-2",
          relationship_id: "r-2",
          mode: "baseline",
          reason: "baseline_schedule",
          created_at: "2026-05-19T00:00:00Z",
        },
      ],
      subscriptionStatus: "trialing",
    });
    runPass.mockResolvedValue({
      id: "cs-2",
      ownerId: "u-1",
      relationshipId: "r-2",
      mode: "baseline",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [],
    });
    const completePass = jest.fn().mockResolvedValue(undefined);
    const engine = { runPass } as unknown as PassEngine;
    const dispatcher = new AmbientPassDispatcher({
      supabase,
      passEngine: engine,
      completePass,
    });

    await dispatcher.dispatchNextPendingPass();
    expect(completePass).toHaveBeenCalledWith("p-2");
  });
});
