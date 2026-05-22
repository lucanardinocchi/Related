import {
  matchUserSpeaker,
  normalizeSpeakerKey,
  parseTranscriptSegments,
  speakerKeysFromTranscript,
  transcriptToChatMessages,
  transcriptToChatMessagesWithAssignments,
  uniqueSpeakersFromTranscript,
  type PocketSpeakerAssignment,
} from "./pocketSpeakerMatch.ts";

export interface PocketChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PocketImportPipelineInput {
  transcript: unknown;
  accountDisplayName: string;
  recordingTitle?: string | null;
  /** Legacy: pick which diarized label is the account holder. */
  userSpeakerOverride?: string | null;
  /** Per-speaker assignments from the agent resolution UI. */
  speakerAssignments?: Record<string, PocketSpeakerAssignment>;
  /** contactId → display name; required when speakerAssignments is set. */
  contactNamesById?: Record<string, string>;
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
  | {
      status: "ambiguous";
      speakers: string[];
      segments: ReturnType<typeof parseTranscriptSegments>;
    };

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
  const chatTitle = input.recordingTitle?.trim()
    ? `Pocket: ${input.recordingTitle.trim()}`
    : "Pocket recording";

  if (input.speakerAssignments) {
    const keys = speakerKeysFromTranscript(segments);
    const missing = keys.filter((k) => !input.speakerAssignments![k]);
    if (missing.length > 0) {
      return { status: "ambiguous", speakers, segments };
    }

    const userKey = keys.find(
      (k) => input.speakerAssignments![k]?.kind === "self",
    );
    const messages = transcriptToChatMessagesWithAssignments(
      segments,
      input.speakerAssignments,
      input.contactNamesById ?? {},
    );
    if (messages.length === 0) {
      return { status: "skipped", reason: "no message content" };
    }

    return {
      status: "ready",
      userSpeaker: userKey ?? keys[0] ?? "self",
      messages,
      speakers,
      chatTitle,
    };
  }

  let userSpeaker = input.userSpeakerOverride?.trim() ?? null;
  if (!userSpeaker) {
    const match = matchUserSpeaker(speakers, input.accountDisplayName);
    if (match.kind === "matched") {
      userSpeaker = match.userSpeaker;
    } else {
      return { status: "ambiguous", speakers: match.speakers, segments };
    }
  }

  const messages = transcriptToChatMessages(segments, userSpeaker);
  if (messages.length === 0) {
    return { status: "skipped", reason: "no message content" };
  }

  return {
    status: "ready",
    userSpeaker,
    messages,
    speakers,
    chatTitle,
  };
}
