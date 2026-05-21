import { createMobileAudioPlayer } from "./createMobileAudioPlayer";

/**
 * Buffers TTS chunks from `VoiceSessionManager.onAgentResponse` and
 * plays them as one clip when `flush()` is called — mirrors web
 * `talk/_audioPlayback.ts` but uses expo-audio under the hood.
 */
export interface StreamingAudioPlayer {
  push: (chunk: Uint8Array) => void;
  flush: () => Promise<void>;
  reset: () => void;
}

export function createMobileStreamingAudioPlayer(
  mimeType = "audio/mpeg",
): StreamingAudioPlayer {
  const player = createMobileAudioPlayer();
  let buffer: Uint8Array[] = [];

  return {
    push(chunk) {
      buffer.push(chunk);
    },
    async flush() {
      if (buffer.length === 0) return;
      const totalLength = buffer.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      buffer = [];
      await player.play(merged, mimeType);
    },
    reset() {
      buffer = [];
      player.stop();
    },
  };
}
