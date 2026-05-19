import ExpoModulesCore
import HealthKit

/**
 RelatedHealthKit — Expo Modules API bridge for iOS HealthKit sleep
 reads (HKCategoryTypeIdentifierSleepAnalysis).

 Two functions exposed to JS:
   - `requestPermissionAsync()`: prompts the User for read access to
     sleep analysis. Resolves `{ granted: bool }`. Apple does not
     surface which permissions the User granted (privacy preserving)
     — we treat dialog completion as `granted: true`.
   - `fetchSleepAsync(fromIso, toIso)`: runs an HKSampleQuery over the
     given range and resolves an array of `RawSleepRecord`-shaped
     dictionaries.

 The native side never writes to HealthKit; only read share is
 requested in `Info.plist` (NSHealthShareUsageDescription) and the
 entitlements (com.apple.developer.healthkit) added by the
 `withHealthKit` Expo config plugin during prebuild.
 */
public class HealthKitModule: Module {
  private let healthStore = HKHealthStore()

  private static let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  public func definition() -> ModuleDefinition {
    // Registers as `RelatedHealthKit` on the JS side.
    Name("RelatedHealthKit")

    AsyncFunction("requestPermissionAsync") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(["granted": false])
        return
      }

      guard let sleepType = HKObjectType.categoryType(
        forIdentifier: .sleepAnalysis,
      ) else {
        promise.resolve(["granted": false])
        return
      }

      // Read-only — `toShare` is empty.
      self.healthStore.requestAuthorization(
        toShare: [],
        read: [sleepType],
      ) { success, error in
        if let error = error {
          promise.reject("HEALTHKIT_AUTH_ERROR", error.localizedDescription)
          return
        }
        // `success: true` means the dialog finished; it does not
        // indicate the User granted. That's the Apple contract.
        promise.resolve(["granted": success])
      }
    }

    AsyncFunction("fetchSleepAsync") {
      (fromIso: String, toIso: String, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve([])
        return
      }

      guard let sleepType = HKObjectType.categoryType(
        forIdentifier: .sleepAnalysis,
      ) else {
        promise.resolve([])
        return
      }

      guard
        let fromDate = HealthKitModule.isoFormatter.date(from: fromIso),
        let toDate = HealthKitModule.isoFormatter.date(from: toIso)
      else {
        promise.reject(
          "HEALTHKIT_BAD_RANGE",
          "fromIso/toIso must be ISO-8601 strings with fractional seconds",
        )
        return
      }

      let predicate = HKQuery.predicateForSamples(
        withStart: fromDate,
        end: toDate,
        options: .strictStartDate,
      )

      let sort = NSSortDescriptor(
        key: HKSampleSortIdentifierStartDate,
        ascending: false,
      )

      let query = HKSampleQuery(
        sampleType: sleepType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort],
      ) { _, samples, error in
        if let error = error {
          promise.reject("HEALTHKIT_QUERY_ERROR", error.localizedDescription)
          return
        }
        guard let categorySamples = samples as? [HKCategorySample] else {
          promise.resolve([])
          return
        }

        let result: [[String: Any?]] = categorySamples.map { sample in
          let durationMinutes = Int(
            sample.endDate.timeIntervalSince(sample.startDate) / 60.0,
          )
          return [
            "id": sample.uuid.uuidString,
            "startedAt": HealthKitModule.isoFormatter.string(
              from: sample.startDate,
            ),
            "endedAt": HealthKitModule.isoFormatter.string(
              from: sample.endDate,
            ),
            "durationMinutes": durationMinutes,
            "quality": HealthKitModule.qualityString(for: sample.value),
          ]
        }
        promise.resolve(result)
      }

      self.healthStore.execute(query)
    }
  }

  /**
   Map HKCategoryValueSleepAnalysis raw values to the shared library's
   `quality` string. Values introduced in iOS 16 (asleepCore / Deep /
   REM) fall back to `asleepUnspecified` when running on older OS.
   */
  private static func qualityString(for raw: Int) -> String {
    if #available(iOS 16.0, *) {
      switch raw {
      case HKCategoryValueSleepAnalysis.inBed.rawValue:
        return "inBed"
      case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
        return "asleepUnspecified"
      case HKCategoryValueSleepAnalysis.awake.rawValue:
        return "awake"
      case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
        return "asleepCore"
      case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
        return "asleepDeep"
      case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
        return "asleepREM"
      default:
        return "asleepUnspecified"
      }
    } else {
      switch raw {
      case HKCategoryValueSleepAnalysis.inBed.rawValue:
        return "inBed"
      case HKCategoryValueSleepAnalysis.awake.rawValue:
        return "awake"
      default:
        return "asleepUnspecified"
      }
    }
  }
}
