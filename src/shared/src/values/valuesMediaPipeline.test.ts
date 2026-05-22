import {
  VALUES_SWIPE_PIPELINE_DEPTH,
  canSwipeValuesQueue,
  characterHasVideo,
  pipelineVideoPriorities,
} from "./valuesMediaPipeline";

const char = (videoUrl: string) =>
  ({
    id: "x",
    name: "X",
    source: "Y",
    values: ["a", "b", "c", "d"],
    videoUrl,
    themeAudioUrl: null,
    mediaMuxed: true,
  }) as const;

describe("valuesMediaPipeline", () => {
  it("characterHasVideo requires non-empty url", () => {
    expect(characterHasVideo(char("https://x.mp4"))).toBe(true);
    expect(characterHasVideo(char(""))).toBe(false);
  });

  it("canSwipe requires current; 11th only when queue is full", () => {
    const ready = char("https://a.mp4");
    const pending = char("");
    const full = Array.from({ length: VALUES_SWIPE_PIPELINE_DEPTH }, () => ready);
    expect(canSwipeValuesQueue(full)).toBe(true);
    full[10] = pending;
    expect(canSwipeValuesQueue(full)).toBe(false);
    expect(canSwipeValuesQueue([ready, pending])).toBe(true);
    expect(canSwipeValuesQueue([ready, ready])).toBe(true);
    expect(canSwipeValuesQueue([pending])).toBe(false);
  });

  it("pipelineVideoPriorities prefers index 10 first", () => {
    const queue = Array.from({ length: 11 }, (_, i) =>
      char(i === 5 || i === 10 ? "" : "https://v.mp4"),
    );
    expect(pipelineVideoPriorities(queue)).toEqual([10, 5]);
  });
});
