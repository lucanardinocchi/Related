# RelatedHealthKit

Native iOS HealthKit bridge for Related. Exposes read-only access to
`HKCategoryTypeIdentifierSleepAnalysis` samples through the Expo
Modules API.

Per **ADR-0006**, the Sleep signal is iOS-only in v1 — this module is
not built on web / Android. The shared library's `PlatformSleepFetcher`
stays Expo-free; the mobile app wires this adapter in at App.tsx bootstrap
on `Platform.OS === "ios"`.

## What's in here

| File | Purpose |
|------|---------|
| `index.ts` | JS facade: `requestPermissionAsync` + `fetchSleepAsync` + `iosHealthKitSleepAdapter` (SleepFetcher-shaped) |
| `ios/HealthKitModule.swift` | Native Expo Module — wraps `HKHealthStore.requestAuthorization` + `HKSampleQuery` |
| `ios/RelatedHealthKit.podspec` | CocoaPods spec consumed during `pod install` |
| `expo-module.config.json` | Tells `expo-modules-autolinking` how to find the iOS module |
| `package.json` | Local-workspace metadata so `expoModule` field resolves |

Plus two files **outside** this directory:
- `src/mobile/plugins/withHealthKit.js` — Expo config plugin that
  injects `NSHealthShareUsageDescription` + the HealthKit entitlements
  during `expo prebuild`.
- `src/mobile/app.json` — registers the plugin under `expo.plugins`.

## Quality mapping

`HKCategoryValueSleepAnalysis` raw values map to the shared
`RawSleepRecord.quality` field as:

| HK value (iOS 16+) | Mapped quality |
|---|---|
| `inBed` | `"inBed"` |
| `asleepUnspecified` | `"asleepUnspecified"` |
| `awake` | `"awake"` |
| `asleepCore` | `"asleepCore"` |
| `asleepDeep` | `"asleepDeep"` |
| `asleepREM` | `"asleepREM"` |

iOS 15 only emits `inBed` / `asleep` / `awake`; we collapse the iOS-15
"asleep" value to `"asleepUnspecified"`.

## How to test on a Mac

You need: macOS, Xcode 15+, an Apple Developer account (free is fine
for local builds), and either an iOS device or Simulator. HealthKit
works in the Simulator since iOS 13 — you can seed sleep samples from
the Health app in the Simulator.

From repo root:

```bash
npm install
cd src/mobile
npx expo prebuild --platform ios
# Opens an `ios/` directory next to App.tsx with a CocoaPods workspace.
open ios/*.xcworkspace
```

In Xcode:
1. Pick a development team under **Signing & Capabilities** (required
   even for the Simulator since HealthKit is an entitlement-gated
   capability).
2. Confirm the **HealthKit** capability is listed (the
   `withHealthKit` plugin adds the entitlement during prebuild — Xcode
   reads the `.entitlements` file the plugin generated).
3. **Run** on a device or Simulator.
4. In the running app, walk Onboarding to the HealthKit step. Tap
   **Connect HealthKit** — Apple's native permission sheet appears.
   Accept; the step advances.
5. To verify a real read, add sleep samples via the Simulator's
   Health app (Browse → Sleep → Add Data) and re-run the daily
   collector entry-point.

## Re-running after JS-only changes

If you only edited `index.ts` or other JS, just save — Metro hot-reloads.
The native module survives. You only need `npx expo prebuild` again if
you touch the `.swift`, the `withHealthKit` plugin, or the entitlements.

## Trouble?

- **"No such module: HealthKit"** in Xcode → did `pod install` run?
  `cd ios && pod install`.
- **"Missing entitlement"** at runtime → the `.entitlements` file is
  out of sync; re-run `npx expo prebuild --platform ios --clean`.
- **Empty `fetchSleepAsync` result** when you know data exists → check
  the device's Health app permission settings (Settings → Privacy →
  Health → Related). Apple does NOT report deny back to the app.
