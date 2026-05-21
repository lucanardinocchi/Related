import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import type { AudioPlayer } from "@related/shared";

/**
 * Mobile implementation of the shared `AudioPlayer` port.
 *
 * `expo-audio`'s `createAudioPlayer(source)` only accepts a URI, asset,
 * or local require — it can't play a raw `Uint8Array` directly. So we
 * write the TTS bytes to a uniquely-named file in the cache directory
 * and play that. The cache is system-wipeable, which matches the
 * ephemeral nature of TTS playback (no need to keep these around).
 *
 * Playback is exclusive: a new `play()` call interrupts any in-flight
 * one (we keep a single ref). `stop()` is safe to call when nothing
 * is playing.
 *
 * The implementation tracks playback completion by polling the
 * player's `currentTime` against `duration`. expo-audio exposes the
 * status via `useAudioPlayerStatus`, but that's a hook — we're not in
 * a React tree here, so polling is the simpler choice. Errors during
 * load propagate as rejected promises so the caller can surface them.
 */
export function createMobileAudioPlayer(): AudioPlayer {
  let currentPlayer:
    | ReturnType<typeof createAudioPlayer>
    | null = null;
  let cacheDir: Directory | null = null;

  const ensureCacheDir = (): Directory => {
    if (!cacheDir) {
      cacheDir = new Directory(Paths.cache, "tts");
      try {
        cacheDir.create({ idempotent: true });
      } catch {
        // Directory exists — fine.
      }
    }
    return cacheDir;
  };

  const releaseCurrent = () => {
    if (currentPlayer) {
      try {
        currentPlayer.pause();
        currentPlayer.release();
      } catch {
        /* noop — already released or torn down */
      }
      currentPlayer = null;
    }
  };

  return {
    async play(bytes: Uint8Array, mimeType?: string): Promise<void> {
      releaseCurrent();

      // expo-audio prefers MP3 / AAC; ElevenLabs default is audio/mpeg
      // (mp3) so .mp3 is the right extension. Honour callers passing
      // something different.
      const ext = mimeTypeToExtension(mimeType);
      const file = new File(ensureCacheDir(), `tts-${Date.now()}.${ext}`);
      file.write(bytes);

      // First time we play: configure the audio session so playback
      // works even if the device is on silent (matches in-pocket
      // voice-out UX). Idempotent.
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

      const player = createAudioPlayer(file.uri);
      currentPlayer = player;

      await new Promise<void>((resolve) => {
        // expo-audio AudioPlayer extends SharedObject and emits a
        // `playbackStatusUpdate` event. Subscribe; resolve when the
        // player reports finished, then release.
        const unsub = (
          player as unknown as {
            addListener: (
              event: string,
              cb: (status: { didJustFinish?: boolean }) => void,
            ) => { remove: () => void };
          }
        ).addListener("playbackStatusUpdate", (status) => {
          if (status?.didJustFinish) {
            unsub.remove();
            resolve();
          }
        });

        try {
          player.play();
        } catch (err) {
          unsub.remove();
          // Resolve rather than reject — the caller treats playback
          // failures as fire-and-forget. Logging is the UI's job.
          console.warn("[mobile-audio-player] play failed:", err);
          resolve();
        }

        // Safety net: poll for completion in case the event doesn't
        // fire (some iOS edge cases). 60s upper bound for any single
        // TTS turn.
        const start = Date.now();
        const interval = setInterval(() => {
          const finished =
            (player as unknown as { didJustFinish?: boolean }).didJustFinish ||
            (player.duration > 0 && player.currentTime >= player.duration);
          if (finished || Date.now() - start > 60_000) {
            clearInterval(interval);
            unsub.remove();
            resolve();
          }
        }, 250);
      });

      releaseCurrent();
      try {
        file.delete();
      } catch {
        /* noop */
      }
    },

    stop(): void {
      releaseCurrent();
    },
  };
}

function mimeTypeToExtension(mime?: string): string {
  if (!mime) return "mp3";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("m4a")) return "m4a";
  return "mp3";
}
