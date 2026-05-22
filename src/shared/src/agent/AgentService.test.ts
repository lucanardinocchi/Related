import type { SupabaseClient } from "@supabase/supabase-js";
import { Executor } from "./Executor";
import { AgentService } from "./AgentService";

describe("AgentService", () => {
  const baseInput = {
    candidateSetId: "cs-1",
    action: { id: "ca-1", type: "OpenThread", payload: { description: "x" } },
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("acceptAction validates required fields before executing", async () => {
    const service = new AgentService({
      supabase: {} as SupabaseClient,
      scheduleTriggeredPass: jest.fn(),
    });

    await expect(
      service.acceptAction({ ...baseInput, candidateSetId: "  " }),
    ).rejects.toThrow(/candidateSetId is required/);
    await expect(
      service.acceptAction({
        ...baseInput,
        action: { ...baseInput.action, id: "" },
      }),
    ).rejects.toThrow(/action\.id is required/);
  });

  it("declineAction routes through DoNothing on the Executor", async () => {
    const executeSpy = jest
      .spyOn(Executor.prototype, "execute")
      .mockResolvedValue({ kind: "declined", actionId: "ca-1" });

    const service = new AgentService({
      supabase: {} as SupabaseClient,
      scheduleTriggeredPass: jest.fn(),
    });

    await service.declineAction(baseInput);

    expect(executeSpy).toHaveBeenCalledWith({
      action: {
        id: "ca-1",
        candidateSetId: "cs-1",
        ownerId: "",
        type: "DoNothing",
        payload: {},
      },
      userEdits: undefined,
    });
  });
});
