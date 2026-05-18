export { AuthClient } from "./auth/AuthClient";
export type {
  AuthClientConfig,
  Session,
  AuthUser,
  Unsubscribe,
} from "./auth/AuthClient";

export { RelationshipsClient } from "./relationships/RelationshipsClient";
export type {
  Contact,
  Relationship,
  CreateContactInput,
  RelationshipsClientConfig,
} from "./relationships/RelationshipsClient";

export { OpenThreadsClient } from "./open-threads/OpenThreadsClient";
export type {
  OpenThread,
  ThreadDirection,
  CreateOpenThreadInput,
  ClosedPerDayBucket,
  ClosedPerDayWindow,
  OpenThreadsClientConfig,
} from "./open-threads/OpenThreadsClient";

export { GroupsClient } from "./groups/GroupsClient";
export type {
  Group,
  GroupMember,
  GroupRelationship,
  CreateGroupInput,
  MembershipInput,
  GroupsClientConfig,
} from "./groups/GroupsClient";

export { CandidatesClient } from "./candidates/CandidatesClient";
export type {
  CandidateSet,
  CandidateAction,
  DecisionState,
  PassMode,
  CandidatesClientConfig,
} from "./candidates/CandidatesClient";

export {
  PassEngine,
  DoNothingAgent,
} from "./agent/PassEngine";
export type {
  AgentCaller,
  AgentPrompt,
  CandidateActionInput,
  CandidateSet as EngineCandidateSet,
  PassEngineOptions,
  RunPassInput,
} from "./agent/PassEngine";
export { UserContextBuilder } from "./agent/UserContextBuilder";
export type {
  UserContextSnapshot,
  CalendarDensitySignal,
  SleepSignal,
} from "./agent/UserContextBuilder";
export { Executor } from "./agent/Executor";
export type {
  PendingCandidateAction,
  UserEdits,
  EffectResult,
  ExecuteInput,
  ExecutorOptions,
  TriggeredPassScheduler,
  MessageComposer,
  MessageComposerInput,
  SendMessagePayload,
} from "./agent/Executor";
export { SystemLinkingComposer } from "./agent/SystemLinkingComposer";
export type {
  URLOpener,
  SystemLinkingComposerOptions,
} from "./agent/SystemLinkingComposer";

export { UserContextClient } from "./user-context/UserContextClient";
export type {
  Goal,
  SituationalState,
  UserContextClientConfig,
  OwnerIdResolver,
} from "./user-context/UserContextClient";

export {
  tryUpdateSituationalState,
  defaultLifeChangeDetector,
} from "./user-context/silentWrite";
export type {
  LifeChangeDetector,
  LifeChangeDetection,
  SilentWriteInput,
  SilentWriteResult,
} from "./user-context/silentWrite";

export {
  extractTransientIntent,
  defaultIntentDetector,
} from "./user-context/transientIntent";
export type {
  IntentDetector,
  DetectedIntent,
  IntentKind,
  TransientIntentWriter,
  ExtractInput as TransientIntentExtractInput,
  ExtractResult as TransientIntentExtractResult,
} from "./user-context/transientIntent";

export { summariseCalendarDensity } from "./signals/calendarDensity";
export type {
  RawCalendarEvent,
  CalendarDensitySignal as CalendarDensitySignalShape,
  CalendarDensityBucket,
} from "./signals/calendarDensity";
export { CalendarCollector } from "./signals/CalendarCollector";
export type {
  CalendarFetcher,
  CalendarCollectorOptions,
} from "./signals/CalendarCollector";

export { summariseSleep } from "./signals/sleepSummary";
export type {
  RawSleepRecord,
  SleepSignal as SleepSignalShape,
  SleepBucket,
} from "./signals/sleepSummary";
export { SleepCollector } from "./signals/SleepCollector";
export type {
  SleepFetcher,
  SleepCollectorOptions,
} from "./signals/SleepCollector";

export {
  NotificationDispatcher,
  isInQuietHours,
} from "./notifications/NotificationDispatcher";
export type {
  QuietHoursWindow,
  NotificationPreferences,
  ActiveSubscription,
  PushPayload,
  PushSender,
  DispatcherOptions,
  DispatchInput,
  DispatchResult,
} from "./notifications/NotificationDispatcher";

export { NotificationsClient } from "./notifications/NotificationsClient";
export type {
  NotificationPreferencesRow,
  NotificationsClientConfig,
} from "./notifications/NotificationsClient";

export { InteractionsClient } from "./interactions/InteractionsClient";
export type {
  Interaction,
  InteractionStatus,
  InteractionContact,
  CreateInteractionInput,
  InteractionsClientConfig,
} from "./interactions/InteractionsClient";
