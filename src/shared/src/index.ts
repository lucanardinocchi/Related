export { AuthClient } from "./auth/AuthClient";
export type {
  AuthClientConfig,
  Session,
  AuthUser,
  Unsubscribe,
} from "./auth/AuthClient";
export type { OAuthSignInProvider } from "./auth/oauthProviders";
export { isRecentlyCreatedAuthUser } from "./auth/isRecentlyCreatedAuthUser";

export {
  placeFromContactLocation,
  contactLocationFromPlace,
  contactLocationsMatch,
} from "./location/place";
export type { Place, ContactLocation } from "./location/place";
export { distanceKm, isWithinRadiusKm } from "./location/distance";
export type { GeoPoint } from "./location/distance";
export {
  filterContactsWithinRadius,
  contactHasLocation,
} from "./location/filterByRadius";

export { RelationshipsClient } from "./relationships/RelationshipsClient";
export type {
  Contact,
  Relationship,
  CreateContactInput,
  UpdateContactInput,
  UpdateRelationshipInput,
  RelationshipsClientConfig,
} from "./relationships/RelationshipsClient";

export { OpenThreadsClient } from "./open-threads/OpenThreadsClient";
export type {
  OpenThread,
  ThreadDirection,
  CommitmentOrigin,
  CommitmentCommunicationStatus,
  CreateOpenThreadInput,
  ListCommitmentsFilter,
  SetCommitmentMetaInput,
  ClosedPerDayBucket,
  ClosedPerDayWindow,
  OpenThreadsClientConfig,
} from "./open-threads/OpenThreadsClient";

/** @deprecated ADR-0010 — prefer EventsClient for /calendar; retained for signal reads. */
export { CalendarEventsClient } from "./calendar/CalendarEventsClient";
export type {
  CalendarEvent,
  CalendarEventSource,
  CalendarEventsClientConfig,
} from "./calendar/CalendarEventsClient";

export {
  relationshipAnalytics,
  calendarAnalytics,
  eventsPerDay,
  commitmentAnalytics,
  peopleAddedPerDay,
  groupsAddedPerDay,
  averageInteractionsByRelationshipAge,
  averageInteractionsAmongTopContacts,
} from "./analytics";
export type {
  RelationshipAnalytics,
  CalendarAnalytics,
  DailyBucket,
  EventsPerDayInput,
  CommitmentAnalytics,
  DailyCountBucket,
  RelationshipAgeEngagementBucket,
  RelationshipAgeBand,
  TopContactsAverage,
} from "./analytics";

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
  PreviousCandidateSet,
  PreviousCandidateAction,
  DecisionState as EngineDecisionState,
} from "./agent/PassEngine";
export { ClaudeAgent } from "./agent/ClaudeAgent";
export type {
  AnthropicMessagesClient,
  ClaudeAgentOptions,
} from "./agent/ClaudeAgent";
export { EdgeFunctionAgentCaller } from "./agent/EdgeFunctionAgentCaller";
export type { EdgeFunctionAgentCallerOptions } from "./agent/EdgeFunctionAgentCaller";
export { AgentService } from "./agent/AgentService";
export type {
  AgentServiceOptions,
  RunEngagedTurnInput,
  CaptureIntentInput,
} from "./agent/AgentService";
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
  ScheduleInteractionPayload,
  LogInteractionPayload,
  OpenThreadPayload,
  CloseThreadPayload,
  UpdateRoleOrCadencePayload,
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
  OperatorStrength,
  UserContextClientConfig,
  OwnerIdResolver,
} from "./user-context/UserContextClient";

export {
  VALUES_CHARACTERS,
  getValuesCharacter,
} from "./values/valuesCharacters";
export type { ValuesCharacter } from "./values/valuesCharacters";
export { VALUES_SEED_COUNT } from "./values/valuesSeedData";
export {
  MIN_ALIGNED_FOR_RANKING,
  MAX_RANKED_ALIGNMENTS,
  VALUES_LAUNCH_CHARACTER_IDS,
  isLaunchCharacter,
  QUEUE_LOW_WATER,
  SUGGEST_BATCH_SIZE,
  buildSeedQueue,
  appendUniqueQueue,
} from "./values/valuesQueue";
export {
  slugifyCharacterId,
  toValuesCharacter,
  mergeCharacterRegistry,
} from "./values/valuesCharacters";
export type { ValuesCharacterDraft } from "./values/valuesCharacters";
export { deterministicHash } from "./values/deterministicHash";
export { buildVideoPrompt } from "./values/valuesMediaVibes";

export { ValuesAlignmentClient } from "./values/ValuesAlignmentClient";
export type {
  CharacterValuesAlignment,
  ValuesAlignmentClientConfig,
} from "./values/ValuesAlignmentClient";
export { ValuesAlignmentStore } from "./values/valuesAlignmentStore";
export {
  alignmentToInferenceCharacter,
  buildInferencePayload,
  buildInferencePayloadFromRows,
  buildRankedInferencePayloadFromRows,
  buildSuggestCharactersPayload,
  resolveCharactersFromAlignments,
} from "./values/valuesAlignmentPayload";
export type {
  InferenceCharacter,
  InferencePayload,
  ProposedValuesProfile,
  RankedInferenceCharacter,
  RankedInferencePayload,
  SuggestCharactersPayload,
} from "./values/valuesAlignmentPayload";

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
export { FakeCalendarFetcher } from "./signals/FakeCalendarFetcher";
export { runDailyCalendarCollection } from "./signals/runDailyCalendarCollection";
export type {
  CalendarFetcherLike,
  RunDailyCalendarCollectionOptions,
  CalendarCollectionSummary,
} from "./signals/runDailyCalendarCollection";

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
export { PlatformSleepFetcher } from "./signals/PlatformSleepFetcher";
export type {
  SleepPlatform,
  PlatformSleepFetcherOptions,
} from "./signals/PlatformSleepFetcher";
export { FakeSleepFetcher } from "./signals/FakeSleepFetcher";
export { runDailySleepCollection } from "./signals/runDailySleepCollection";
export type {
  RunDailySleepCollectionInput,
  RunDailySleepCollectionResult,
} from "./signals/runDailySleepCollection";

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

export {
  SubscriptionsClient,
  SUBSCRIPTION_PRICE_LABEL,
  ACTIVE_SUBSCRIPTION_STATUSES,
  isActiveSubscriptionStatus,
} from "./billing/SubscriptionsClient";
export type {
  SubscriptionStatus,
  SubscriptionState,
} from "./billing/SubscriptionsClient";

export {
  AMBIENT_PASS_MODES,
  canRunAmbientIntelligence,
  isAmbientPassMode,
} from "./billing/ambientAccess";
export type { AmbientPassMode } from "./billing/ambientAccess";

export {
  AMBIENT_BILLING_MODAL_SESSION_KEY,
  hasShownAmbientBillingModalThisSession,
  markAmbientBillingModalShownThisSession,
} from "./billing/ambientSession";

export { AmbientIntelligenceClient } from "./agent/AmbientIntelligenceClient";
export type { ScheduledAmbientPass } from "./agent/AmbientIntelligenceClient";

export {
  OnboardingClient,
  ONBOARDING_STEPS,
} from "./onboarding/OnboardingClient";
export type {
  OnboardingStep,
  OnboardingState,
  OnboardingClientConfig,
} from "./onboarding/OnboardingClient";

export { UserProviderTokensClient } from "./integrations/UserProviderTokensClient";
export type {
  ProviderName,
  UserProviderToken,
  UpsertUserProviderTokenInput,
} from "./integrations/UserProviderTokensClient";

export {
  GOOGLE_SCOPE_CALENDAR_READONLY,
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_GMAIL_SEND,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_INTEGRATION_SCOPES,
  tokenHasGmailAccess,
  tokenHasCalendarAccess,
} from "./integrations/google/googleScopes";

export {
  OUTLOOK_SCOPE_CALENDARS_READ,
  OUTLOOK_SCOPE_OFFLINE_ACCESS,
  OUTLOOK_SCOPE_USER_READ,
  OUTLOOK_CALENDAR_SCOPES,
  tokenHasOutlookCalendarAccess,
} from "./integrations/outlook/outlookScopes";

export { GmailClient } from "./integrations/GmailClient";
export type {
  GmailMessageSummary,
  GmailMessageDetail,
  ListGmailForContactInput,
  SendGmailInput,
  GmailContactStatus,
} from "./integrations/GmailClient";

export {
  INSTAGRAM_SCOPE_BASIC,
  INSTAGRAM_SCOPE_MANAGE_MESSAGES,
  INSTAGRAM_INTEGRATION_SCOPES,
  tokenHasInstagramAccess,
} from "./integrations/instagram/instagramScopes";

export { InstagramClient } from "./integrations/InstagramClient";
export type {
  InstagramMessageSummary,
  ListInstagramForContactInput,
  SendInstagramInput,
  InstagramContactStatus,
} from "./integrations/InstagramClient";

export {
  X_SCOPE_DM_READ,
  X_SCOPE_DM_WRITE,
  X_SCOPE_USERS_READ,
  X_SCOPE_TWEET_READ,
  X_SCOPE_OFFLINE_ACCESS,
  X_INTEGRATION_SCOPES,
  tokenHasXAccess,
} from "./integrations/x/xScopes";

export {
  generateCodeVerifier,
  generateCodeChallenge,
} from "./integrations/x/xPkce";

export { XClient } from "./integrations/XClient";
export type {
  XMessageSummary,
  ListXForContactInput,
  SendXInput,
  ListXForGroupInput,
  SendXGroupInput,
  XContactStatus,
} from "./integrations/XClient";

export {
  TIKTOK_SCOPE_USER_INFO_BASIC,
  TIKTOK_SCOPE_USER_INFO_PROFILE,
  TIKTOK_INTEGRATION_SCOPES,
  tokenHasTikTokAccess,
} from "./integrations/tiktok/tiktokScopes";

export { TikTokClient } from "./integrations/TikTokClient";
export type {
  TikTokMessageSummary,
  ListTikTokForContactInput,
  SendTikTokInput,
  ListTikTokForGroupInput,
  SendTikTokGroupInput,
  TikTokContactStatus,
} from "./integrations/TikTokClient";

export {
  WHATSAPP_SCOPE_BUSINESS_MANAGEMENT,
  WHATSAPP_SCOPE_BUSINESS_MESSAGING,
  WHATSAPP_SCOPE_BUSINESS_MANAGEMENT_ALT,
  WHATSAPP_INTEGRATION_SCOPES,
  tokenHasWhatsAppAccess,
} from "./integrations/whatsapp/whatsappScopes";

export { WhatsAppClient } from "./integrations/WhatsAppClient";
export type {
  WhatsAppMessageSummary,
  ListWhatsAppForContactInput,
  SendWhatsAppInput,
  ListWhatsAppForGroupInput,
  SendWhatsAppGroupInput,
  WhatsAppContactStatus,
} from "./integrations/WhatsAppClient";

export { OutlookClient } from "./integrations/OutlookClient";

export {
  fetchGoogleCalendarEvents,
  refreshGoogleAccessToken,
} from "./integrations/google/GoogleCalendarFetcher";
export type {
  FetchGoogleCalendarEventsInput,
  FetchGoogleCalendarEventsResult,
  RefreshGoogleAccessTokenInput,
  RefreshGoogleAccessTokenResult,
} from "./integrations/google/GoogleCalendarFetcher";

export {
  fetchOutlookCalendarEvents,
  refreshOutlookAccessToken,
  mapOutlookEvent,
} from "./integrations/outlook/OutlookCalendarFetcher";
export type {
  FetchOutlookCalendarEventsInput,
  FetchOutlookCalendarEventsResult,
  RefreshOutlookAccessTokenInput,
  RefreshOutlookAccessTokenResult,
  RawOutlookCalendarEvent,
} from "./integrations/outlook/OutlookCalendarFetcher";

export type { SessionWithProviderTokens } from "./auth/AuthClient";

export { ChatsClient } from "./chats/ChatsClient";
export type {
  Chat,
  ChatSummary,
  ChatMessage,
  MessageRole,
  AppendMessageInput,
  ChatsClientConfig,
  ChatsClientOptions,
  ChatRespondEvent,
  ExtractionResult,
} from "./chats/ChatsClient";

export {
  createStreamingPlaceholder,
  reduceMessagesForRespondEvent,
  applyRespondEventUpdater,
  consumeRespondStream,
} from "./chats/conversationalChatState";
export type {
  ToolCallSummary,
  SetMessagesFn,
  ConsumeRespondStreamParams,
} from "./chats/conversationalChatState";

export { MessagesClient, normalizePhone } from "./messages/MessagesClient";
export type {
  MessageThread,
  Message,
  MessageDirection,
  OutboundQueueItem,
  OutboundQueueStatus,
  RelayDevice,
  RelayPairingCode,
  MessagesClientConfig,
  LinkThreadInput,
  SendMessageInput,
} from "./messages/MessagesClient";

export {
  fromCommsPlatformMessage,
  fromGmailMessage,
  fromImessageMessage,
  fromInstagramMessage,
  fromTikTokMessage,
  fromTikTokRow,
  fromWhatsAppMessage,
  fromWhatsAppRow,
  fromXMessage,
  mergeCommsTimelineItems,
  COMMS_PLATFORM_LABELS,
} from "./comms/relationshipCommsTimeline";
export type {
  CommsDirection,
  CommsPlatform,
  CommsPlatformMessageRow,
  CommsTimelineItem,
} from "./comms/relationshipCommsTimeline";

export { InteractionsClient } from "./interactions/InteractionsClient";
export type {
  Interaction,
  InteractionStatus,
  InteractionCategory,
  InteractionContact,
  CreateInteractionInput,
  InteractionsClientConfig,
} from "./interactions/InteractionsClient";

export { EventsClient } from "./events/EventsClient";
export type {
  Event,
  EventType,
  EventStatus,
  EventSource,
  EventAttendee,
  CreateEventInput,
  UpdateEventInput,
  EventsClientConfig,
} from "./events/EventsClient";

export {
  VoiceSessionManager,
  InterruptedError as VoiceSessionInterruptedError,
} from "./voice/VoiceSessionManager";
export type {
  SessionHandle,
  AgentTurnResult,
  VoiceSessionManagerOptions,
  StartSessionInput,
} from "./voice/VoiceSessionManager";
export type {
  STTAdapter,
  STTEvent,
  STTTranscribeInput,
} from "./voice/STTAdapter";
export type { TTSAdapter, TTSSynthesizeInput } from "./voice/TTSAdapter";
export { FakeSTTAdapter } from "./voice/FakeSTTAdapter";
export type { FakeSTTAdapterOptions } from "./voice/FakeSTTAdapter";
export { FakeTTSAdapter } from "./voice/FakeTTSAdapter";
export type { FakeTTSAdapterOptions } from "./voice/FakeTTSAdapter";
export { WisprFlowSTTAdapter } from "./voice/WisprFlowSTTAdapter";
export type { WisprFlowSTTAdapterOptions } from "./voice/WisprFlowSTTAdapter";
export { ElevenLabsTTSAdapter } from "./voice/ElevenLabsTTSAdapter";
export type { ElevenLabsTTSAdapterOptions } from "./voice/ElevenLabsTTSAdapter";

export { createTTSPlayback } from "./voice/TTSPlayback";
export type {
  TTSPlayback,
  TTSPlaybackDeps,
  AudioPlayer,
} from "./voice/TTSPlayback";
