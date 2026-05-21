import launchIds from "./valuesLaunchCharacters.json";

/** Characters with generated swipe clips — shown first on /values in this order. */
export const VALUES_LAUNCH_CHARACTER_IDS: readonly string[] = launchIds;

export function isLaunchCharacter(id: string): boolean {
  return (VALUES_LAUNCH_CHARACTER_IDS as string[]).includes(id);
}
