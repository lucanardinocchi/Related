/**
 * MediaRecorder wrapper that produces an async-iterable of audio bytes.
 *
 * The current iterable yields exactly one chunk (the full recorded blob)
 * once `stop()` is called. The `OpenAIWhisperSTTAdapter` accumulates
 * chunks before POSTing anyway, so partial yields would not change
 * behaviour — this keeps the shape simple and predictable.
 *
 * Mirrors the helper inside the mobile AgentScreen (`startMediaCapture` /
 * `stopMediaCapture`) but expressed as an object so the React component
 * can hold a single ref and call `.stop()` cleanly.
 */
export interface MicCaptureHandle {
  audio: AsyncIterable<Uint8Array>;
  stop: () => void;
}

export interface MicCaptureError extends Error {
  code: "permission-denied" | "unsupported" | "recorder-error";
}

function makeError(
  code: MicCaptureError["code"],
  message: string,
): MicCaptureError {
  const err = new Error(message) as MicCaptureError;
  err.code = code;
  return err;
}

/**
 * Requests microphone access and starts a `MediaRecorder`. The returned
 * `audio` iterable yields one chunk after `stop()` is called. The caller
 * is responsible for invoking `stop()` exactly once — calling it tears
 * down the recorder and releases the underlying mic tracks.
 */
export async function startMicCapture(): Promise<MicCaptureHandle> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw makeError(
      "unsupported",
      "Your browser doesn't support microphone capture.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw makeError(
      "permission-denied",
      err instanceof Error
        ? `Microphone access denied: ${err.message}`
        : "Microphone access denied.",
    );
  }

  const recorder = new MediaRecorder(stream);
  const blobs: Blob[] = [];

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) blobs.push(ev.data);
    };
    recorder.onstop = () => {
      const merged = new Blob(blobs, {
        type: recorder.mimeType || "audio/webm",
      });
      resolve(merged);
    };
    recorder.onerror = (ev) => {
      const e =
        (ev as unknown as { error?: Error })?.error ??
        makeError("recorder-error", "MediaRecorder error");
      reject(e);
    };
  });

  recorder.start();

  let stopped_called = false;
  const stop = () => {
    if (stopped_called) return;
    stopped_called = true;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
  };

  const audio: AsyncIterable<Uint8Array> = (async function* iterate() {
    const blob = await stopped;
    const buf = await blob.arrayBuffer();
    yield new Uint8Array(buf);
  })();

  return { audio, stop };
}
