import type { ValuesCharacterDraft } from "./valuesCharacters";
import type { SuggestCharactersPayload } from "./valuesAlignmentPayload";
import type { ValuesMediaErrorCode } from "./valuesMediaPipeline";

export type ValuesCharacterGenerationPhase = "video" | "complete";

export interface ValuesCharacterWithMedia extends ValuesCharacterDraft {
  videoUrl?: string;
  mediaMuxed?: boolean;
}

export interface GenerateValuesCharacterStartResult {
  status: "processing" | "ready" | "error";
  phase?: ValuesCharacterGenerationPhase;
  predictionId?: string;
  character: ValuesCharacterWithMedia;
  videoUrl?: string;
  code?: ValuesMediaErrorCode;
  message?: string;
}

export type GenerateValuesCharacterStartPayload = SuggestCharactersPayload & {
  action?: "start";
  character?: ValuesCharacterDraft;
};

export interface GenerateValuesCharacterPollPayload {
  action: "poll";
  predictionId: string;
  character: ValuesCharacterWithMedia;
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 12 * 60_000;

export async function pollUntilCharacterReady(
  poll: (payload: GenerateValuesCharacterPollPayload) => Promise<GenerateValuesCharacterStartResult>,
  predictionId: string,
  character: ValuesCharacterWithMedia,
  options?: { signal?: AbortSignal },
): Promise<GenerateValuesCharacterStartResult> {
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    if (options?.signal?.aborted) {
      throw new Error("Character generation cancelled");
    }

    const result = await poll({
      action: "poll",
      predictionId,
      character,
    });

    if (result.status === "ready" && result.videoUrl) return result;
    if (result.status === "error") return result;

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    status: "error",
    code: "generation_failed",
    message: "Video generation timed out",
    character,
  };
}
