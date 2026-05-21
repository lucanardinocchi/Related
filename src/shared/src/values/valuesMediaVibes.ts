import { deterministicHash } from "./deterministicHash";
import {
  LICENSED_MUSIC_TRACKS,
  type LicensedMusicTrack,
  type ValuesMediaMood,
} from "./valuesMediaMusic";

const VALUE_MOOD_HINTS: Record<string, ValuesMediaMood> = {
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

export function inferCharacterMood(character: {
  values: string[];
}): ValuesMediaMood {
  const scores = new Map<ValuesMediaMood, number>();

  for (const value of character.values) {
    const mood = VALUE_MOOD_HINTS[value.toLowerCase()];
    if (mood) scores.set(mood, (scores.get(mood) ?? 0) + 1);
  }

  if (scores.size === 0) return "ambient";

  const top = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return top;
}

export function pickLicensedTrack(character: {
  id: string;
  values: string[];
}): LicensedMusicTrack {
  const mood = inferCharacterMood(character);
  const pool = LICENSED_MUSIC_TRACKS.filter((track) =>
    track.moods.includes(mood),
  );
  const candidates = pool.length > 0 ? pool : LICENSED_MUSIC_TRACKS;
  const hash = deterministicHash(`${character.id}:${mood}`);
  return candidates[hash % candidates.length]!;
}

export function buildVideoPrompt(character: {
  name: string;
  source: string;
  values: string[];
}): string {
  const mood = inferCharacterMood(character);
  const themes = character.values.slice(0, 3).join(", ");
  return [
    `Portrait 9:16 video of ${character.name} from "${character.source}".`,
    `Show the actual recognizable character — face and upper body, Tinder-style swipe-card framing, centered subject.`,
    `Match ${character.name}'s iconic appearance, wardrobe, and energy from ${character.source}.`,
    `Mood: ${mood}. Evoke ${themes}.`,
    "Subtle natural motion: slight expression shift, breath, or soft camera push-in.",
    "Cinematic lighting, shallow depth of field, no on-screen text or logos.",
  ].join(" ");
}
