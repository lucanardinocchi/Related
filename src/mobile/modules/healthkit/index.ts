/**
 * RelatedHealthKit — JS facade for the native iOS HealthKit bridge.
 *
 * The native module is built via the Expo Modules API in Swift (see
 * `ios/HealthKitModule.swift` + `RelatedHealthKit.podspec`). It is
 * registered automatically by `expo-modules-autolinking` during
 * `npx expo prebuild --platform ios`, so this facade can resolve it
 * by name with `requireNativeModule`.
 *
 * On non-iOS platforms the facade short-circuits to safe defaults so
 * the module can be imported anywhere without crashing the Metro
 * bundler. The mobile app should still guard the install site with
 * `Platform.OS === "ios"` — the iOS-only resolution is a defence in
 * depth, not the primary gate.
 */
import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import type { RawSleepRecord } from "@related/shared";

interface NativeRelatedHealthKit {
  requestPermissionAsync: () => Promise<{ granted: boolean }>;
  fetchSleepAsync: (
    fromIso: string,
    toIso: string,
  ) => Promise<RawSleepRecord[]>;
}

let cached: NativeRelatedHealthKit | null = null;

function resolve(): NativeRelatedHealthKit | null {
  if (Platform.OS !== "ios") return null;
  if (cached) return cached;
  try {
    // The Swift module registers itself with this name (see Module.Name
    // in HealthKitModule.swift).
    cached = requireNativeModule<NativeRelatedHealthKit>("RelatedHealthKit");
    return cached;
  } catch {
    // Module not linked — happens on the Expo Go runtime / Metro
    // dev-client without prebuild. Treat as "no HealthKit available".
    return null;
  }
}

/**
 * Prompts the User for HealthKit read permission for sleep analysis.
 * Returns `{ granted: false }` when called on a platform without the
 * native module (web, Android, Expo Go).
 *
 * Apple's design is that `HKHealthStore.requestAuthorization` does NOT
 * tell you whether the User said yes — only whether the dialog
 * completed. We treat dialog completion as "granted: true" and let the
 * later `fetchSleepAsync` call surface the no-data case organically.
 * If the User flat-out denied at the system level, the dialog still
 * resolves and `fetchSleepAsync` will simply return an empty array.
 */
export async function requestPermissionAsync(): Promise<{ granted: boolean }> {
  const mod = resolve();
  if (!mod) return { granted: false };
  return mod.requestPermissionAsync();
}

/**
 * Fetches HealthKit sleep-analysis samples in the [fromIso, toIso]
 * window and returns them in the shared library's `RawSleepRecord`
 * shape. Returns `[]` on non-iOS / un-linked builds.
 */
export async function fetchSleepAsync(
  fromIso: string,
  toIso: string,
): Promise<RawSleepRecord[]> {
  const mod = resolve();
  if (!mod) return [];
  return mod.fetchSleepAsync(fromIso, toIso);
}

/**
 * SleepFetcher-shaped adapter — pluggable into
 * `PlatformSleepFetcher.setIosHealthKitAdapter` at App.tsx bootstrap.
 *
 * Looks back 3 days from `asOf` (matches the sleepSummary window).
 */
export const iosHealthKitSleepAdapter = async (
  asOf: Date,
): Promise<RawSleepRecord[]> => {
  const to = asOf;
  const from = new Date(asOf);
  from.setUTCDate(from.getUTCDate() - 3);
  return fetchSleepAsync(from.toISOString(), to.toISOString());
};
