import { tryUpdateSituationalState, defaultLifeChangeDetector } from "./silentWrite";

describe("defaultLifeChangeDetector (rule-based, Slice 10)", () => {
  it("detects 'I just moved to X' and proposes the new state", () => {
    const result = defaultLifeChangeDetector(
      "Yeah I just moved to Sydney last week",
      null,
    );
    expect(result.newState).toMatch(/moved to Sydney/i);
    expect(result.why).toMatch(/mov/i);
  });

  it("returns no update when the utterance has no life-change signal", () => {
    const result = defaultLifeChangeDetector(
      "Plan something for Sam's birthday",
      null,
    );
    expect(result.newState).toBeNull();
  });

  it("does not propose a duplicate update when current state already matches", () => {
    const result = defaultLifeChangeDetector(
      "I just moved to Sydney",
      "Just moved to Sydney",
    );
    expect(result.newState).toBeNull();
  });
});

describe("tryUpdateSituationalState — full silent-write pipeline", () => {
  it("parses an utterance, persists the new state, and produces an inline surface message", async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const result = await tryUpdateSituationalState({
      utterance: "I just moved to Sydney last week",
      currentState: null,
      write,
      detect: defaultLifeChangeDetector,
    });

    expect(result.updated).toBe(true);
    expect(result.newState).toMatch(/moved to Sydney/i);
    expect(result.surface).toMatch(/situational state/i);
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/moved to Sydney/i));
  });

  it("is a no-op when the detector returns no change", async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const result = await tryUpdateSituationalState({
      utterance: "Plan something for Sam's birthday",
      currentState: null,
      write,
      detect: defaultLifeChangeDetector,
    });

    expect(result.updated).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
