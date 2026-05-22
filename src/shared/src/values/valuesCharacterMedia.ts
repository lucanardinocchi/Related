import mediaManifest from "./valuesMediaManifest.json";

const manifest = mediaManifest as Record<string, string>;

export function hasGeneratedMedia(characterId: string): boolean {
  return Boolean(manifest[characterId]);
}

/** Characters with a Seedance clip in valuesMediaManifest — safe for /values swipe cards. */
export function filterCharactersWithMedia<T extends { id: string }>(
  characters: T[],
): T[] {
  return characters.filter((character) => hasGeneratedMedia(character.id));
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

  return {
    ...character,
    videoUrl: "",
    themeAudioUrl: null,
    mediaMuxed: false,
  };
}

export function isSwipeReadyCharacter(character: {
  id: string;
  videoUrl: string;
}): boolean {
  return Boolean(character.videoUrl?.trim()) || hasGeneratedMedia(character.id);
}
