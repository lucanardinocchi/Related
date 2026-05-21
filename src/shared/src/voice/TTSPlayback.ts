import type { TTSAdapter } from "./TTSAdapter";

/**
 * Minimal audio-output port. The mobile app supplies an
 * `expo-audio`-backed implementation; the web app uses an `<audio>`
 * element wrapper. The shared TTS playback module is platform-agnostic.
 */
export interface AudioPlayer {
  /**
   * Play raw audio bytes. Resolves when playback finishes (or is
   * stopped). Implementations should drop new calls if a previous
   * `play()` is still resolving — playback is exclusive.
   */
  play(bytes: Uint8Array, mimeType?: string): Promise<void>;
  stop(): void;
}

export interface TTSPlaybackDeps {
  ttsAdapter: TTSAdapter;
  player: AudioPlayer;
  /**
   * Read mute state lazily — `getMuted()` is called every `play()`
   * invocation so toggles take effect immediately without having to
   * recreate the playback module. Defaults to never-muted.
   */
  getMuted?: () => boolean;
  /**
   * Optional mime type passed through to the player. Defaults to
   * `audio/mpeg` (ElevenLabs default).
   */
  mimeType?: string;
}

export interface TTSPlayback {
  /**
   * Synthesize `text` and play it. Resolves when playback finishes (or
   * immediately, if muted). Errors propagate; callers should handle
   * them (e.g. show a toast) without crashing the conversation.
   */
  play(text: string): Promise<void>;
  /** Stop any in-flight playback. Safe to call when nothing is playing. */
  stop(): void;
}

/**
 * Build a TTS playback handle. Pure data-flow:
 *
 *   text → ttsAdapter.synthesizeStream → concat → player.play → done
 *
 * Mute is honoured before invoking the adapter, so a muted session
 * incurs no Edge Function call.
 */
export function createTTSPlayback(deps: TTSPlaybackDeps): TTSPlayback {
  const { ttsAdapter, player, getMuted, mimeType = "audio/mpeg" } = deps;
  return {
    async play(text: string) {
      if (!text) return;
      if (getMuted?.()) return;
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of ttsAdapter.synthesizeStream({ text })) {
        chunks.push(chunk);
        total += chunk.byteLength;
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      await player.play(merged, mimeType);
    },
    stop() {
      player.stop();
    },
  };
}
