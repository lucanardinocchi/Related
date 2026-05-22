import {
  parseTranscriptSegments,
  transcriptToChatMessages,
} from "./pocketSpeakerMatch";
import { runPocketImportPipeline } from "./pocketImportPipeline";

describe("parseTranscriptSegments", () => {
  it("returns empty array for nullish transcript", () => {
    expect(parseTranscriptSegments(null)).toEqual([]);
    expect(parseTranscriptSegments(undefined)).toEqual([]);
  });

  it("passes through diarized segment arrays", () => {
    const segments = [
      { speaker: "Luca", text: "Hello" },
      { speaker: "Alice", text: "Hi" },
    ];
    expect(parseTranscriptSegments(segments)).toEqual(segments);
  });

  it("wraps plain string transcripts as a single segment", () => {
    expect(parseTranscriptSegments("  solo transcript  ")).toEqual([
      { speaker: null, text: "solo transcript" },
    ]);
  });

  it("ignores blank string transcripts", () => {
    expect(parseTranscriptSegments("   ")).toEqual([]);
  });
});

describe("transcriptToChatMessages", () => {
  it("maps matched speaker to user and others to assistant", () => {
    expect(
      transcriptToChatMessages(
        [
          { speaker: "Luca", text: "Hey" },
          { speaker: "Alice", text: "Hello" },
        ],
        "Luca",
      ),
    ).toEqual([
      { role: "user", content: "Hey" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("merges consecutive segments from the same role", () => {
    expect(
      transcriptToChatMessages(
        [
          { speaker: "Luca", text: "Part one" },
          { speaker: "Luca", text: "Part two" },
        ],
        "Luca",
      ),
    ).toEqual([{ role: "user", content: "Part one\nPart two" }]);
  });

  it("skips segments with empty text", () => {
    expect(
      transcriptToChatMessages(
        [{ speaker: "Luca", text: "  " }, { speaker: "Luca", text: "Real" }],
        "Luca",
      ),
    ).toEqual([{ role: "user", content: "Real" }]);
  });
});

describe("runPocketImportPipeline", () => {
  it("returns ready with parsed messages when speaker matches", () => {
    const result = runPocketImportPipeline({
      transcript: [
        { speaker: "Luca", text: "Notes from the meeting" },
        { speaker: "Alice", text: "Follow up tomorrow" },
      ],
      accountDisplayName: "Luca Nardinocchi",
      recordingTitle: "Team sync",
    });

    expect(result).toEqual({
      status: "ready",
      userSpeaker: "Luca",
      speakers: ["Luca", "Alice"],
      chatTitle: "Pocket: Team sync",
      messages: [
        { role: "user", content: "Notes from the meeting" },
        { role: "assistant", content: "Follow up tomorrow" },
      ],
    });
  });

  it("uses speaker override and skips auto-match", () => {
    const result = runPocketImportPipeline({
      transcript: [{ speaker: "Speaker A", text: "Hello" }],
      accountDisplayName: "Luca Nardinocchi",
      userSpeakerOverride: "Speaker A",
    });

    expect(result).toMatchObject({
      status: "ready",
      userSpeaker: "Speaker A",
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("returns ambiguous when no speaker matches account name", () => {
    const result = runPocketImportPipeline({
      transcript: [
        { speaker: "Alice", text: "Hi" },
        { speaker: "Bob", text: "Hey" },
      ],
      accountDisplayName: "Luca Nardinocchi",
    });

    expect(result).toEqual({
      status: "ambiguous",
      speakers: ["Alice", "Bob"],
    });
  });

  it("skips empty transcripts", () => {
    expect(
      runPocketImportPipeline({
        transcript: [],
        accountDisplayName: "Luca",
      }),
    ).toEqual({ status: "skipped", reason: "empty transcript" });
  });

  it("skips when all segments lack message content", () => {
    expect(
      runPocketImportPipeline({
        transcript: [{ speaker: "Luca", text: "   " }],
        accountDisplayName: "Luca",
        userSpeakerOverride: "Luca",
      }),
    ).toEqual({ status: "skipped", reason: "no message content" });
  });
});
