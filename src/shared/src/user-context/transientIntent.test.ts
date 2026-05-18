import {
  extractTransientIntent,
  defaultIntentDetector,
} from "./transientIntent";

describe("defaultIntentDetector (rule-based, Slice 14)", () => {
  it("captures 'I want to X' as an explicit intent", () => {
    expect(defaultIntentDetector("I want to plan my birthday")).toEqual({
      content: "plan my birthday",
      kind: "wants_to",
    });
  });

  it("captures 'I have X minutes / time' as a time-budget intent", () => {
    expect(defaultIntentDetector("I have 15 minutes and want to send a quick reply")).toMatchObject({
      content: expect.stringContaining("15 minutes"),
      kind: "time_budget",
    });
  });

  it("returns null when no intent signal is detected", () => {
    expect(defaultIntentDetector("how is Sam doing")).toBeNull();
  });
});

describe("extractTransientIntent — write pipeline", () => {
  it("persists captured intent with a configurable expiry", async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const result = await extractTransientIntent({
      utterance: "I want to plan my birthday",
      sessionId: "sess-1",
      relationshipId: "r-1",
      expiresInMs: 10 * 60_000,
      now: new Date("2026-05-19T10:00:00Z"),
      write,
      detect: defaultIntentDetector,
    });

    expect(result.captured).toBe(true);
    expect(write).toHaveBeenCalledWith({
      sessionId: "sess-1",
      relationshipId: "r-1",
      content: "plan my birthday",
      expiresAt: new Date("2026-05-19T10:10:00Z").toISOString(),
    });
  });

  it("is a no-op when the detector finds no intent", async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const result = await extractTransientIntent({
      utterance: "how is Sam doing",
      sessionId: "sess-1",
      expiresInMs: 10 * 60_000,
      now: new Date(),
      write,
      detect: defaultIntentDetector,
    });
    expect(result.captured).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
