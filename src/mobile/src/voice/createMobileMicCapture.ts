import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder as ExpoAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import {
  startExpoAudioCapture,
  type AudioCaptureHandle,
  type ExpoAudioApi,
  type RecordingApi,
} from "./ExpoAudioRecorder";

/**
 * Production binding from the platform-agnostic `startExpoAudioCapture`
 * adapter (tested in `ExpoAudioRecorder.test.ts`) to the live
 * `expo-audio` runtime API. Threads `AudioModule.AudioRecorder`,
 * `requestRecordingPermissionsAsync`, and `setAudioModeAsync` into the
 * shape the adapter expects, and reads the resulting URI via the
 * modern `expo-file-system` File class.
 *
 * The expo-audio runtime API differs slightly from the adapter's
 * contract (start = `record()` vs `startAsync`, stop = `stop()` vs
 * `stopAndUnloadAsync`, uri = property vs `getURI()`), so we shim it.
 * Tests don't see any of this — they exercise the adapter against a
 * pure jest mock — which is the whole point of the split.
 */
export async function createMobileMicCapture(): Promise<AudioCaptureHandle> {
  return startExpoAudioCapture({
    audio: makeExpoAudioApi(),
    fetchUri: async (uri) => {
      const file = new File(uri);
      return file.bytes();
    },
  });
}

function makeExpoAudioApi(): ExpoAudioApi {
  return {
    requestPermissionsAsync: async () => {
      const res = await requestRecordingPermissionsAsync();
      return { granted: res.granted, status: res.status };
    },
    setAudioModeAsync: async (opts) => {
      // Translate the adapter's loose options into expo-audio's mode
      // shape — we only ever ask for "we want to record now."
      const _opts = opts as { allowsRecordingIOS?: boolean };
      await setAudioModeAsync({
        allowsRecording: _opts.allowsRecordingIOS ?? true,
        playsInSilentMode: true,
      });
    },
    Recording: ExpoAudioRecordingShim as unknown as new () => RecordingApi,
    RecordingOptionsPresets: { HIGH_QUALITY: RecordingPresets.HIGH_QUALITY },
  };
}

/**
 * Shim mapping the adapter's `RecordingApi` (prepareToRecord →
 * startAsync → stopAndUnloadAsync → getURI) onto expo-audio's
 * `AudioRecorder` (prepareToRecord → record → stop → uri property).
 *
 * Only the methods the adapter calls are implemented.
 */
class ExpoAudioRecordingShim implements RecordingApi {
  private rec: ExpoAudioRecorder | null = null;

  async prepareToRecordAsync(opts: unknown): Promise<void> {
    const options =
      (opts as Partial<Parameters<ExpoAudioRecorder["prepareToRecordAsync"]>[0]>) ??
      RecordingPresets.HIGH_QUALITY;
    this.rec = new AudioModule.AudioRecorder(options) as ExpoAudioRecorder;
    await this.rec.prepareToRecordAsync(options);
  }

  async startAsync(): Promise<void> {
    if (!this.rec) throw new Error("Recording not prepared");
    this.rec.record();
  }

  async stopAndUnloadAsync(): Promise<void> {
    if (!this.rec) return;
    await this.rec.stop();
  }

  getURI(): string | null {
    return this.rec?.uri ?? null;
  }
}
