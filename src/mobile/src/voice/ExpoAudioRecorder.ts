/**
 * Native (and Expo Web) audio capture adapter — produces the same
 * `{ audio: AsyncIterable<Uint8Array>, stop }` interface that the
 * `WisprFlowSTTAdapter` and the web `_recorder.ts` consume, but
 * powered by `expo-av` so it works on iOS and Android devices (where
 * `MediaRecorder` is not available).
 *
 * Tests inject the `expo-av` API surface and a `fetchUri` helper. The
 * production wrapper at the bottom of this file binds those to the
 * real `expo-av` module and `expo-file-system`. This split keeps the
 * tests free of native-module dependencies.
 */

export interface RecordingApi {
  prepareToRecordAsync(opts: unknown): Promise<void>;
  startAsync(): Promise<void>;
  stopAndUnloadAsync(): Promise<void>;
  getURI(): string | null;
}

export interface ExpoAudioApi {
  requestPermissionsAsync(): Promise<{ granted: boolean; status?: string }>;
  setAudioModeAsync(opts: unknown): Promise<void>;
  Recording: new () => RecordingApi;
  RecordingOptionsPresets: { HIGH_QUALITY: unknown };
}

export interface AudioCaptureHandle {
  audio: AsyncIterable<Uint8Array>;
  stop: () => void;
}

export interface AudioCaptureError extends Error {
  code: "permission-denied" | "recorder-error" | "no-uri";
}

function makeError(
  code: AudioCaptureError["code"],
  message: string,
): AudioCaptureError {
  const err = new Error(message) as AudioCaptureError;
  err.code = code;
  return err;
}

export interface StartExpoAudioCaptureDeps {
  audio: ExpoAudioApi;
  /**
   * Reads a `file://` URI written by expo-av and returns its bytes.
   * In production this is implemented with `expo-file-system`'s
   * `readAsStringAsync(..., { encoding: 'base64' })` + base64 decode,
   * or a `fetch(uri).then(r => r.arrayBuffer())` on Expo Web.
   */
  fetchUri: (uri: string) => Promise<Uint8Array>;
}

/**
 * Start a recording. Returns a handle whose `audio` iterable yields
 * exactly one `Uint8Array` chunk after `stop()` is called — matching
 * the web `MicCaptureHandle` shape so callers (and the
 * `WisprFlowSTTAdapter`, which accumulates anyway) are
 * platform-agnostic.
 */
export async function startExpoAudioCapture(
  deps: StartExpoAudioCaptureDeps,
): Promise<AudioCaptureHandle> {
  const perms = await deps.audio.requestPermissionsAsync();
  if (!perms.granted) {
    throw makeError(
      "permission-denied",
      "Microphone access denied. Enable it in Settings.",
    );
  }

  await deps.audio.setAudioModeAsync({ allowsRecordingIOS: true });

  const recording = new deps.audio.Recording();
  await recording.prepareToRecordAsync(
    deps.audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  await recording.startAsync();

  let stopped = false;
  let stoppedResolver: ((bytes: Uint8Array) => void) | null = null;
  let stoppedRejecter: ((err: unknown) => void) | null = null;
  const stoppedPromise = new Promise<Uint8Array>((resolve, reject) => {
    stoppedResolver = resolve;
    stoppedRejecter = reject;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    (async () => {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (!uri) {
          throw makeError("no-uri", "Recording produced no URI.");
        }
        const bytes = await deps.fetchUri(uri);
        stoppedResolver?.(bytes);
      } catch (err) {
        stoppedRejecter?.(err);
      }
    })();
  };

  const audio: AsyncIterable<Uint8Array> = (async function* iterate() {
    const bytes = await stoppedPromise;
    yield bytes;
  })();

  return { audio, stop };
}
