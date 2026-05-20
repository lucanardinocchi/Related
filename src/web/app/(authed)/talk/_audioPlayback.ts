/**
 * Lightweight TTS-chunk player.
 *
 * The `VoiceSessionManager` calls `onAgentResponse(chunk)` for each
 * `Uint8Array` chunk emitted by the TTS adapter. ElevenLabs streams MP3,
 * and `MediaSource` for `audio/mpeg` has spotty Safari support, so for v1
 * we buffer all chunks for a turn and play them as a single `Blob` once
 * the stream ends.
 *
 * Usage:
 *   const player = createAudioPlayer();
 *   handle.onAgentResponse(player.push);
 *   // …after the turn resolves:
 *   await player.flush();
 *   // or on barge-in:
 *   player.reset();
 */
export interface AudioPlayer {
  /** Buffer one TTS chunk. Safe to call from any context. */
  push: (chunk: Uint8Array) => void;
  /** Play whatever's been buffered since the last flush/reset. Returns when playback ends. */
  flush: () => Promise<void>;
  /** Discard buffered audio and stop any in-flight playback. */
  reset: () => void;
}

export function createAudioPlayer(mimeType: string = "audio/mpeg"): AudioPlayer {
  let buffer: Uint8Array[] = [];
  let currentAudio: HTMLAudioElement | null = null;
  let currentUrl: string | null = null;

  function reset() {
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        /* noop */
      }
      currentAudio.src = "";
      currentAudio = null;
    }
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
    buffer = [];
  }

  return {
    push(chunk) {
      buffer.push(chunk);
    },
    async flush() {
      if (buffer.length === 0) return;
      // Copy into a single ArrayBuffer via Blob so we can hand the
      // browser one URL instead of streaming chunks (which would need
      // MediaSource).
      const blob = new Blob(buffer as BlobPart[], { type: mimeType });
      buffer = [];
      const url = URL.createObjectURL(blob);
      currentUrl = url;
      const audio = new Audio(url);
      currentAudio = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () =>
            reject(new Error("Audio playback failed."));
          // `play()` returns a promise; if it rejects (e.g. autoplay
          // gate when user hasn't interacted yet) surface that.
          audio.play().catch(reject);
        });
      } finally {
        if (currentAudio === audio) currentAudio = null;
        if (currentUrl === url) {
          URL.revokeObjectURL(url);
          currentUrl = null;
        }
      }
    },
    reset,
  };
}
