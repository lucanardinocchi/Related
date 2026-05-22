export type SpeakerMatchResult =
  | { kind: "matched"; userSpeaker: string }
  | { kind: "ambiguous"; speakers: string[]; candidates: string[] }
  | { kind: "no_match"; speakers: string[] };

function normalizeSpeakerLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Loose match between a diarized speaker label and the Pocket account
 * display name. Exact match first; then first-name match when >= 3 chars.
 */
export function speakerLabelsMatch(
  speaker: string,
  accountDisplayName: string,
): boolean {
  const a = normalizeSpeakerLabel(speaker);
  const b = normalizeSpeakerLabel(accountDisplayName);
  if (!a || !b) return false;
  if (a === b) return true;

  const firstA = a.split(/\s+/)[0] ?? "";
  const firstB = b.split(/\s+/)[0] ?? "";
  if (firstA.length >= 3 && firstA === firstB) return true;

  return false;
}

export function uniqueSpeakersFromTranscript(
  segments: Array<{ speaker?: string | null }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    const speaker = seg.speaker?.trim();
    if (!speaker || seen.has(speaker)) continue;
    seen.add(speaker);
    out.push(speaker);
  }
  return out;
}

export function matchUserSpeaker(
  speakers: string[],
  accountDisplayName: string,
): SpeakerMatchResult {
  const uniqueSpeakers = [...new Set(speakers.map((s) => s.trim()).filter(Boolean))];
  const candidates = uniqueSpeakers.filter((speaker) =>
    speakerLabelsMatch(speaker, accountDisplayName),
  );

  if (candidates.length === 1) {
    return { kind: "matched", userSpeaker: candidates[0]! };
  }
  if (candidates.length > 1) {
    return { kind: "ambiguous", speakers: uniqueSpeakers, candidates };
  }
  return { kind: "no_match", speakers: uniqueSpeakers };
}

export interface PocketTranscriptSegment {
  speaker?: string | null;
  text?: string | null;
}

export function parseTranscriptSegments(
  transcript: unknown,
): PocketTranscriptSegment[] {
  if (!transcript) return [];
  if (Array.isArray(transcript)) {
    return transcript as PocketTranscriptSegment[];
  }
  if (typeof transcript === "string" && transcript.trim()) {
    return [{ speaker: null, text: transcript.trim() }];
  }
  return [];
}

export function transcriptToChatMessages(
  segments: PocketTranscriptSegment[],
  userSpeaker: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const seg of segments) {
    const text = seg.text?.trim();
    if (!text) continue;
    const speaker = seg.speaker?.trim() ?? "";
    const role = speaker === userSpeaker ? "user" : "assistant";
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content += `\n${text}`;
    } else {
      messages.push({ role, content: text });
    }
  }
  return messages;
}

/** Key used in speaker assignment maps when Pocket omits a diarized label. */
export const POCKET_UNLABELED_SPEAKER = "__unlabeled__";

export type PocketSpeakerAssignment =
  | { kind: "self" }
  | { kind: "contact"; contactId: string };

export function normalizeSpeakerKey(speaker: string | null | undefined): string {
  const trimmed = speaker?.trim();
  return trimmed ? trimmed : POCKET_UNLABELED_SPEAKER;
}

export function speakerKeysFromTranscript(
  segments: PocketTranscriptSegment[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    const key = normalizeSpeakerKey(seg.speaker);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Build chat messages from explicit per-speaker assignments. Self → user
 * role; contacts → assistant with `[label]: text` so extraction sees names.
 */
export function transcriptToChatMessagesWithAssignments(
  segments: PocketTranscriptSegment[],
  assignments: Record<string, PocketSpeakerAssignment>,
  contactNamesById: Record<string, string>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let lastSpeakerKey: string | null = null;

  for (const seg of segments) {
    const text = seg.text?.trim();
    if (!text) continue;

    const key = normalizeSpeakerKey(seg.speaker);
    const assignment = assignments[key];
    if (!assignment) continue;

    const role: "user" | "assistant" =
      assignment.kind === "self" ? "user" : "assistant";

    let content: string;
    if (assignment.kind === "self") {
      content = text;
    } else {
      const contactName =
        contactNamesById[assignment.contactId]?.trim() ?? "Unknown";
      const label = seg.speaker?.trim()
        ? `${seg.speaker.trim()} (${contactName})`
        : contactName;
      content = `[${label}]: ${text}`;
    }

    const last = messages[messages.length - 1];
    if (last && last.role === role && lastSpeakerKey === key) {
      last.content += `\n${content}`;
    } else {
      messages.push({ role, content });
    }
    lastSpeakerKey = key;
  }

  return messages;
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
