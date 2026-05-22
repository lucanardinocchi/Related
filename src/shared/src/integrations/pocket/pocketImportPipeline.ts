import {
  matchUserSpeaker,
  parseTranscriptSegments,
  transcriptToChatMessages,
  uniqueSpeakersFromTranscript,
} from "./pocketSpeakerMatch.ts";

export interface PocketChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PocketImportPipelineInput {
  transcript: unknown;
  accountDisplayName: string;
  recordingTitle?: string | null;
  userSpeakerOverride?: string | null;
}

export type PocketImportPipelineResult =
  | {
      status: "ready";
      userSpeaker: string;
      messages: PocketChatMessage[];
      speakers: string[];
      chatTitle: string;
    }
  | { status: "skipped"; reason: "empty transcript" | "no message content" }
  | { status: "ambiguous"; speakers: string[] };

/**
 * Pure Pocket import steps: parse transcript, match user speaker, build chat messages.
 * Edge adapters persist the result and call extract-context.
 */
export function runPocketImportPipeline(
  input: PocketImportPipelineInput,
): PocketImportPipelineResult {
  const segments = parseTranscriptSegments(input.transcript);
  if (segments.length === 0) {
    return { status: "skipped", reason: "empty transcript" };
  }

  const speakers = uniqueSpeakersFromTranscript(segments);
  let userSpeaker = input.userSpeakerOverride?.trim() ?? null;
  if (!userSpeaker) {
    const match = matchUserSpeaker(speakers, input.accountDisplayName);
    if (match.kind === "matched") {
      userSpeaker = match.userSpeaker;
    } else {
      return { status: "ambiguous", speakers: match.speakers };
    }
  }

  const messages = transcriptToChatMessages(segments, userSpeaker);
  if (messages.length === 0) {
    return { status: "skipped", reason: "no message content" };
  }

  const chatTitle = input.recordingTitle?.trim()
    ? `Pocket: ${input.recordingTitle.trim()}`
    : "Pocket recording";

  return {
    status: "ready",
    userSpeaker,
    messages,
    speakers,
    chatTitle,
  };
}
