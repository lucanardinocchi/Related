/**
 * Generate muxed Values swipe clips: AI video (Replicate) + licensed music + FFmpeg
 * → Supabase Storage → valuesMediaManifest.json
 *
 * Usage:
 *   cd src/backend
 *   REPLICATE_API_TOKEN=r8_... \
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/generate-values-media.mjs --limit 3
 *
 * Requires: ffmpeg on PATH.
 */

import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");
const SHARED_VALUES = join(REPO_ROOT, "src/shared/src/values");
const SEED_PATH = join(SHARED_VALUES, "valuesSeedData.json");
const LAUNCH_PATH = join(SHARED_VALUES, "valuesLaunchCharacters.json");
const MANIFEST_PATH = join(SHARED_VALUES, "valuesMediaManifest.json");
const CACHE_DIR = join(__dirname, "../.cache/values-media");

const jiti = createJiti(import.meta.url);
const { buildVideoPrompt } = jiti(
  join(REPO_ROOT, "src/shared/src/values/valuesMediaVibes.ts"),
);

const BUCKET = "values-media";
/** PixVerse V6 — top-tier character emotion + native 9:16 on Replicate (May 2026). */
const DEFAULT_MODEL = "pixverse/pixverse-v6";
const DEFAULT_DURATION = Number(process.env.VALUES_MEDIA_DURATION ?? "8");
const MUSIC_VOLUME = Number(process.env.VALUES_MEDIA_MUSIC_VOLUME ?? "0.35");
const PORTRAIT_WIDTH = 1080;
const PORTRAIT_HEIGHT = 1920;

/** @type {Record<string, { buildInput: (args: { prompt: string; duration: number }) => object }>} */
const MODEL_PROFILES = {
  "pixverse/pixverse-v6": {
    buildInput({ prompt, duration }) {
      return {
        prompt,
        aspect_ratio: "9:16",
        quality: "720p",
        duration: Math.min(15, Math.max(1, duration)),
        generate_audio_switch: false,
        generate_multi_clip_switch: false,
      };
    },
  },
  "kwaivgi/kling-v3-video": {
    buildInput({ prompt, duration }) {
      return {
        prompt,
        aspect_ratio: "9:16",
        mode: "standard",
        duration: Math.min(15, Math.max(3, duration)),
        generate_audio: false,
      };
    },
  },
  "minimax/video-01": {
    buildInput({ prompt }) {
      return {
        prompt,
        prompt_optimizer: true,
      };
    },
  },
};

/** @typedef {{ id: string; name: string; source: string; values: string[] }} SeedEntry */

function parseArgs(argv) {
  const args = {
    limit: Infinity,
    ids: /** @type {string[]} */ ([]),
    force: false,
    dryRun: false,
    skipUpload: false,
    launch: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--id") args.ids.push(argv[++i]);
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--skip-upload") args.skipUpload = true;
    else if (arg === "--launch") args.launch = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/generate-values-media.mjs [options]

Options:
  --id <character-id>   Generate one character (repeatable)
  --limit <n>           Cap batch size
  --force               Regenerate even if manifest entry exists
  --dry-run             Print actions without API calls or uploads
  --skip-upload         Keep files local; do not upload or update manifest
  --launch              Generate the 10 launch characters from valuesLaunchCharacters.json

Env:
  REPLICATE_API_TOKEN          Required unless --dry-run
  REPLICATE_VIDEO_MODEL        Default: ${DEFAULT_MODEL}
  SUPABASE_URL                 Required unless --skip-upload
  SUPABASE_SERVICE_ROLE_KEY    Required unless --skip-upload
  VALUES_MEDIA_DURATION        Clip length seconds (default ${DEFAULT_DURATION})
  VALUES_MEDIA_MUSIC_VOLUME    Background music gain 0-1 (default ${MUSIC_VOLUME})
`);
      process.exit(0);
    }
  }

  return args;
}

function requireFfmpeg() {
  const result = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (result.status !== 0) {
    console.error("ffmpeg not found on PATH. Install ffmpeg and retry.");
    process.exit(1);
  }
}

/** Must match src/shared/src/values/deterministicHash.ts */
function deterministicHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

const VALUE_MOOD_HINTS = {
  kindness: "warm",
  empathy: "warm",
  love: "warm",
  friendship: "warm",
  belonging: "warm",
  courage: "epic",
  bravery: "epic",
  justice: "epic",
  duty: "epic",
  leadership: "epic",
  hope: "triumphant",
  growth: "triumphant",
  excellence: "triumphant",
  humor: "playful",
  wit: "playful",
  joy: "playful",
  chaos: "tense",
  control: "tense",
  intensity: "tense",
  survival: "tense",
  logic: "mysterious",
  mystery: "mysterious",
  wisdom: "ambient",
  patience: "ambient",
  wonder: "ambient",
};

const LICENSED_MUSIC_TRACKS = [
  {
    id: "soundhelix-1",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    moods: ["warm", "triumphant", "playful"],
  },
  {
    id: "soundhelix-2",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    moods: ["ambient", "warm"],
  },
  {
    id: "soundhelix-3",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    moods: ["ambient", "warm"],
  },
  {
    id: "soundhelix-4",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    moods: ["epic", "triumphant"],
  },
  {
    id: "soundhelix-5",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    moods: ["epic", "tense", "playful"],
  },
  {
    id: "soundhelix-6",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    moods: ["mysterious", "tense", "ambient"],
  },
  {
    id: "soundhelix-7",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
    moods: ["warm", "playful"],
  },
  {
    id: "soundhelix-8",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    moods: ["playful", "warm"],
  },
];

function inferCharacterMood(character) {
  const scores = new Map();
  for (const value of character.values) {
    const mood = VALUE_MOOD_HINTS[value.toLowerCase()];
    if (mood) scores.set(mood, (scores.get(mood) ?? 0) + 1);
  }
  if (scores.size === 0) return "ambient";
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function pickLicensedTrack(character) {
  const mood = inferCharacterMood(character);
  const pool = LICENSED_MUSIC_TRACKS.filter((track) =>
    track.moods.includes(mood),
  );
  const candidates = pool.length > 0 ? pool : LICENSED_MUSIC_TRACKS;
  const hash = deterministicHash(`${character.id}:${mood}`);
  return candidates[hash % candidates.length];
}

function buildModelInput(model, prompt, duration) {
  const profile = MODEL_PROFILES[model] ?? MODEL_PROFILES[DEFAULT_MODEL];
  return profile.buildInput({ prompt, duration });
}

async function downloadToFile(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status}: ${url}`);
  }
  if (!res.body) throw new Error(`Empty body: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function replicateCreateVideo({ token, model, prompt, duration }) {
  const input = buildModelInput(model, prompt, duration);
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate create failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function replicatePollPrediction({ token, id, timeoutMs = 15 * 60_000 }) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Replicate poll failed (${res.status}): ${body}`);
    }

    const prediction = await res.json();
    if (prediction.status === "succeeded") return prediction;
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Replicate prediction timed out after ${timeoutMs}ms`);
}

function extractVideoUrl(prediction) {
  const output = prediction.output;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  throw new Error("Unexpected Replicate output shape");
}

function muxVideoWithMusic({ videoPath, musicPath, outputPath, duration, musicVolume }) {
  const portraitFilter = [
    `scale=${PORTRAIT_WIDTH}:${PORTRAIT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${PORTRAIT_WIDTH}:${PORTRAIT_HEIGHT}`,
  ].join(",");

  const args = [
    "-y",
    "-i",
    videoPath,
    "-stream_loop",
    "-1",
    "-i",
    musicPath,
    "-filter_complex",
    `[0:v]${portraitFilter}[vout];[1:a]volume=${musicVolume}[aout]`,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-t",
    String(duration),
    "-shortest",
    outputPath,
  ];

  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg mux failed for ${outputPath}`);
  }
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(manifest) {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function uploadToSupabase({ admin, localPath, characterId }) {
  const objectPath = `${characterId}.mp4`;
  const bytes = readFileSync(localPath);

  const { error } = await admin.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw error;

  const { data } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function generateOne({
  character,
  token,
  model,
  duration,
  musicVolume,
  admin,
  dryRun,
  skipUpload,
  force,
}) {
  const workDir = join(CACHE_DIR, character.id);
  mkdirSync(workDir, { recursive: true });

  const rawVideoPath = join(workDir, "raw.mp4");
  const musicPath = join(workDir, "music.mp3");
  const muxedPath = join(workDir, "muxed.mp4");

  if (force) {
    for (const path of [rawVideoPath, musicPath, muxedPath]) {
      if (existsSync(path)) unlinkSync(path);
    }
  }

  const prompt = buildVideoPrompt(character);
  const track = pickLicensedTrack(character);

  console.log(`\n→ ${character.id} (${character.name})`);
  console.log(`  mood: ${inferCharacterMood(character)} · music: ${track.id}`);
  console.log(`  prompt: ${prompt}`);

  if (dryRun) return null;

  if (!existsSync(rawVideoPath)) {
    const created = await replicateCreateVideo({
      token,
      model,
      prompt,
      duration,
    });
    console.log(`  replicate: ${created.id} (${created.status})`);
    const finished = await replicatePollPrediction({ token, id: created.id });
    const videoUrl = extractVideoUrl(finished);
    console.log(`  downloading raw video…`);
    await downloadToFile(videoUrl, rawVideoPath);
  } else {
    console.log("  reusing cached raw.mp4");
  }

  if (!existsSync(musicPath)) {
    console.log("  downloading licensed music…");
    await downloadToFile(track.url, musicPath);
  }

  console.log("  muxing with ffmpeg…");
  muxVideoWithMusic({
    videoPath: rawVideoPath,
    musicPath,
    outputPath: muxedPath,
    duration,
    musicVolume,
  });

  if (skipUpload) {
    console.log(`  local muxed: ${muxedPath}`);
    return null;
  }

  console.log("  uploading to Supabase Storage…");
  const publicUrl = await uploadToSupabase({
    admin,
    localPath: muxedPath,
    characterId: character.id,
  });
  console.log(`  public: ${publicUrl}`);
  return publicUrl;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun) requireFfmpeg();

  /** @type {SeedEntry[]} */
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  let characters = seed;
  if (args.launch) {
    const launchIds = JSON.parse(readFileSync(LAUNCH_PATH, "utf8"));
    characters = launchIds
      .map((id) => seed.find((entry) => entry.id === id))
      .filter(Boolean);
    console.log(`Launch batch: ${characters.map((c) => c.id).join(", ")}`);
  } else if (args.ids.length > 0) {
    characters = seed.filter((entry) => args.ids.includes(entry.id));
    const missing = args.ids.filter((id) => !characters.some((c) => c.id === id));
    if (missing.length > 0) {
      console.warn(`Unknown character ids: ${missing.join(", ")}`);
    }
  }
  if (Number.isFinite(args.limit)) {
    characters = characters.slice(0, args.limit);
  }

  const token = process.env.REPLICATE_API_TOKEN;
  const model = process.env.REPLICATE_VIDEO_MODEL ?? DEFAULT_MODEL;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!args.dryRun && !token) {
    console.error("Missing REPLICATE_API_TOKEN");
    process.exit(1);
  }
  if (!args.dryRun && !args.skipUpload && (!url || !serviceKey)) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin =
    url && serviceKey
      ? createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  const manifest = readManifest();
  let generated = 0;

  for (const character of characters) {
    if (!args.force && manifest[character.id]) {
      console.log(`skip ${character.id} (manifest entry exists)`);
      continue;
    }

    const publicUrl = await generateOne({
      character,
      token,
      model,
      duration: DEFAULT_DURATION,
      musicVolume: MUSIC_VOLUME,
      admin,
      dryRun: args.dryRun,
      skipUpload: args.skipUpload,
      force: args.force,
    });

    if (publicUrl) {
      manifest[character.id] = publicUrl;
      writeManifest(manifest);
      generated += 1;
    }
  }

  console.log(`\nDone. Generated ${generated} clip(s). Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
