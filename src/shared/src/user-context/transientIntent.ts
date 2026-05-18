/**
 * Transient Intent capture per Slice 14 / ADR-0002. The Voice Session
 * Manager invokes a detector on early User turns; when it returns a non-
 * null result the pipeline persists it scoped to the live session, with
 * a short expiry so it decays naturally.
 *
 * Slice 14 ships a rule-based default detector. The real LLM-tool extractor
 * lands in Slice 8 (or with Slice 13's voice work) behind the same
 * `IntentDetector` interface — everything downstream stays the same.
 */

export type IntentKind = "wants_to" | "time_budget" | "other";

export interface DetectedIntent {
  content: string;
  kind: IntentKind;
}

export type IntentDetector = (utterance: string) => DetectedIntent | null;

export const defaultIntentDetector: IntentDetector = (utterance) => {
  const u = utterance.trim();

  // "I have X minutes / hour / time and …"
  const time = u.match(
    /\bI have (?:about |only )?(\d+\s*(?:minutes?|mins?|hours?|hrs?)|time)\b[^.,!?]*/i,
  );
  if (time) {
    return { content: time[0].replace(/^I have /i, "").trim(), kind: "time_budget" };
  }

  // "I want to / I'd like to / I need to …"
  const wants = u.match(
    /\bI (?:want to|need to|would like to|'?d like to) ([^.,!?]+)/i,
  );
  if (wants) {
    return { content: wants[1].trim(), kind: "wants_to" };
  }

  return null;
};

export interface TransientIntentWriteInput {
  sessionId: string;
  relationshipId?: string;
  content: string;
  expiresAt: string;
}

export type TransientIntentWriter = (
  input: TransientIntentWriteInput,
) => Promise<void>;

export interface ExtractInput {
  utterance: string;
  sessionId: string;
  relationshipId?: string;
  expiresInMs: number;
  now: Date;
  write: TransientIntentWriter;
  detect: IntentDetector;
}

export interface ExtractResult {
  captured: boolean;
  content?: string;
  kind?: IntentKind;
  expiresAt?: string;
}

export async function extractTransientIntent(
  input: ExtractInput,
): Promise<ExtractResult> {
  const detected = input.detect(input.utterance);
  if (!detected) return { captured: false };

  const expiresAt = new Date(input.now.getTime() + input.expiresInMs).toISOString();
  await input.write({
    sessionId: input.sessionId,
    relationshipId: input.relationshipId,
    content: detected.content,
    expiresAt,
  });

  return {
    captured: true,
    content: detected.content,
    kind: detected.kind,
    expiresAt,
  };
}
