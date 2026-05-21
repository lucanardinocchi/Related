/**
 * Normalise recorder output (webm, m4a, mp3, …) into mono 16 kHz PCM WAV —
 * the format Wispr Flow's REST API expects.
 */
import decode from "npm:audio-decode@2.2.3";

const TARGET_SAMPLE_RATE = 16_000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function audioToWav16k(
  bytes: Uint8Array,
  mime?: string,
): Promise<Uint8Array> {
  const rootMime = (mime ?? "audio/webm").split(";")[0]!.trim().toLowerCase();
  if (rootMime === "audio/wav" || rootMime === "audio/x-wav") {
    const parsed = parseWavPcm(bytes);
    if (
      parsed &&
      parsed.sampleRate === TARGET_SAMPLE_RATE &&
      parsed.numChannels === 1 &&
      parsed.bitsPerSample === 16
    ) {
      return bytes;
    }
    if (parsed) {
      const mono = parsed.numChannels === 1
        ? parsed.samples
        : mixToMono(parsed.samples, parsed.numChannels);
      const resampled = resample(mono, parsed.sampleRate, TARGET_SAMPLE_RATE);
      return encodeWavPcm16(resampled, TARGET_SAMPLE_RATE);
    }
  }

  const audioBuffer = await decode(bytes);
  const mono = mixChannels(audioBuffer);
  const resampled = resample(mono, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
  return encodeWavPcm16(resampled, TARGET_SAMPLE_RATE);
}

interface ParsedWav {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  samples: Float32Array;
}

function parseWavPcm(bytes: Uint8Array): ParsedWav | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readTag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") return null;

  let offset = 12;
  let numChannels = 1;
  let sampleRate = TARGET_SAMPLE_RATE;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkId === "fmt ") {
      const audioFormat = view.getUint16(chunkDataOffset, true);
      if (audioFormat !== 1) return null;
      numChannels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || bitsPerSample !== 16) return null;

  const frameCount = dataSize / (bitsPerSample / 8) / numChannels;
  const samples = new Float32Array(frameCount);
  let sampleIndex = 0;
  for (let i = 0; i < frameCount; i++) {
    let acc = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const sampleOffset = dataOffset + (i * numChannels + ch) * 2;
      const int16 = view.getInt16(sampleOffset, true);
      acc += int16 / 32768;
    }
    samples[sampleIndex++] = acc / numChannels;
  }

  return { numChannels, sampleRate, bitsPerSample, samples };
}

function mixChannels(audioBuffer: {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channel = audioBuffer.getChannelData(ch);
    for (let i = 0; i < mono.length; i++) {
      mono[i]! += channel[i]! / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

function mixToMono(samples: Float32Array, numChannels: number): Float32Array {
  if (numChannels === 1) return samples;
  const frameCount = samples.length / numChannels;
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let acc = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      acc += samples[i * numChannels + ch]!;
    }
    mono[i] = acc / numChannels;
  }
  return mono;
}

function resample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }
  return output;
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < 4; i++) {
      view.setUint8(offset + i, tag.charCodeAt(i));
    }
  };

  writeTag(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeTag(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}
