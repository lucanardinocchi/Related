import mediaManifest from "./valuesMediaManifest.json";
import { deterministicHash } from "./deterministicHash";
import { pickLicensedTrack } from "./valuesMediaVibes";

const VIDEOS = [
  "https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-beach-5016-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-beach-with-waves-747-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-young-woman-walking-on-the-beach-538-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-palm-tree-in-the-wind-1240-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-sunset-over-the-sea-1199-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-running-on-the-beach-537-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4",
] as const;

const manifest = mediaManifest as Record<string, string>;

export function hasGeneratedMedia(characterId: string): boolean {
  return Boolean(manifest[characterId]);
}

export function assignCharacterMedia<
  T extends { id: string; name: string; source: string; values: string[] },
>(
  character: T,
): T & { videoUrl: string; themeAudioUrl: string | null; mediaMuxed: boolean } {
  const generated = manifest[character.id];
  if (generated) {
    return {
      ...character,
      videoUrl: generated,
      themeAudioUrl: null,
      mediaMuxed: true,
    };
  }

  const hash = deterministicHash(character.id);
  return {
    ...character,
    videoUrl: VIDEOS[hash % VIDEOS.length]!,
    themeAudioUrl: pickLicensedTrack(character).url,
    mediaMuxed: false,
  };
}
