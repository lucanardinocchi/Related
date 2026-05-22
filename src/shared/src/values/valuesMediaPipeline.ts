import type { ValuesCharacter } from "./valuesCharacters";

/** Swipe is blocked until the 11th queued character (index 10) has a clip. */
export const VALUES_SWIPE_PIPELINE_DEPTH = 11;

/** Target number of characters kept ready ahead of the current card. */
export const VALUES_MEDIA_BUFFER = 10;

export type ValuesMediaErrorCode =
  | "insufficient_credits"
  | "generation_failed"
  | "suggestion_failed";

export function characterHasVideo(
  character: Pick<ValuesCharacter, "videoUrl">,
): boolean {
  return Boolean(character.videoUrl?.trim());
}

/**
 * User may swipe when the current card has a clip. When the queue already has
 * 11 characters, the 11th must also be ready (10-ahead buffer + gate).
 */
export function canSwipeValuesQueue(
  queue: Pick<ValuesCharacter, "videoUrl">[],
): boolean {
  if (queue.length === 0) return false;
  if (!characterHasVideo(queue[0]!)) return false;
  if (queue.length < VALUES_SWIPE_PIPELINE_DEPTH) return true;
  return characterHasVideo(queue[VALUES_SWIPE_PIPELINE_DEPTH - 1]!);
}

/** True when background generation should keep running. */
export function queueNeedsMediaWork(
  queue: Pick<ValuesCharacter, "videoUrl">[],
  options?: {
    targetDepth?: number;
    growQueue?: boolean;
  },
): boolean {
  const depth = options?.targetDepth ?? VALUES_SWIPE_PIPELINE_DEPTH;
  if (queue.length === 0) return true;
  if (pipelineVideoPriorities(queue, depth).length > 0) return true;
  if (options?.growQueue && queue.length < depth) return true;
  return false;
}

/** Indices 0..depth-1 missing video, highest index first (11th before 1st). */
export function pipelineVideoPriorities(
  queue: Pick<ValuesCharacter, "videoUrl">[],
  depth = VALUES_SWIPE_PIPELINE_DEPTH,
): number[] {
  const limit = Math.min(queue.length, depth);
  const missing: number[] = [];
  for (let i = limit - 1; i >= 0; i--) {
    if (!characterHasVideo(queue[i]!)) missing.push(i);
  }
  return missing;
}

export function applyVideoUrl<T extends ValuesCharacter>(
  character: T,
  videoUrl: string,
): T {
  return {
    ...character,
    videoUrl,
    themeAudioUrl: null,
    mediaMuxed: true,
  };
}
