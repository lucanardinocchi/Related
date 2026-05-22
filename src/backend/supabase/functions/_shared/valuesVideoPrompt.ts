/** Keep in sync with src/shared/src/values/valuesMediaVibes.ts buildVideoPrompt */

const VALUE_MOOD_HINTS: Record<string, string> = {
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

function inferCharacterMood(values: string[]): string {
  const scores = new Map<string, number>();
  for (const value of values) {
    const mood = VALUE_MOOD_HINTS[value.toLowerCase()];
    if (mood) scores.set(mood, (scores.get(mood) ?? 0) + 1);
  }
  if (scores.size === 0) return "ambient";
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export function buildVideoPrompt(character: {
  name: string;
  source: string;
  values: string[];
}): string {
  const mood = inferCharacterMood(character.values);
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
