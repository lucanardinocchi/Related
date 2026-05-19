/**
 * Expo config plugin — adds the HealthKit usage description and
 * entitlements during `expo prebuild --platform ios`.
 *
 * Without this plugin, every prebuild would wipe out the manual
 * Info.plist + entitlements edits and the App Store would reject the
 * build for "HealthKit framework used without entitlement".
 *
 * Registered from app.json as:
 *
 *   "plugins": [
 *     ["./plugins/withHealthKit", { ... overrides ... }]
 *   ]
 *
 * Defaults:
 *  - NSHealthShareUsageDescription — read-share copy shown in the
 *    permission dialog
 *  - com.apple.developer.healthkit = true — base entitlement
 *  - com.apple.developer.healthkit.access = ["HKCategoryTypeIdentifierSleepAnalysis"]
 *    — Sleep is a CategoryType, not a QuantityType (the brief
 *    flagged this — Apple's identifier is HKCategoryTypeIdentifierSleepAnalysis).
 */

const { withInfoPlist, withEntitlementsPlist } = require("@expo/config-plugins");

const DEFAULT_SHARE_USAGE =
  "Related reads your sleep data to gauge your energy for social plans. Read-only; never written.";

const DEFAULT_HEALTHKIT_ACCESS = ["HKCategoryTypeIdentifierSleepAnalysis"];

function withHealthKitInfoPlist(config, { healthShareUsageDescription }) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSHealthShareUsageDescription =
      healthShareUsageDescription || DEFAULT_SHARE_USAGE;
    return cfg;
  });
}

function withHealthKitEntitlements(config, { healthKitAccessTypes }) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.healthkit"] = true;
    cfg.modResults["com.apple.developer.healthkit.access"] =
      healthKitAccessTypes && healthKitAccessTypes.length > 0
        ? healthKitAccessTypes
        : DEFAULT_HEALTHKIT_ACCESS;
    return cfg;
  });
}

function withHealthKit(config, options = {}) {
  let next = config;
  next = withHealthKitInfoPlist(next, options);
  next = withHealthKitEntitlements(next, options);
  return next;
}

module.exports = withHealthKit;
