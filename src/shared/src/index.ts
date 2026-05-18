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
} from "./agent/Executor";

export { InteractionsClient } from "./interactions/InteractionsClient";
export type {
  Interaction,
  InteractionStatus,
  InteractionContact,
  CreateInteractionInput,
  InteractionsClientConfig,
} from "./interactions/InteractionsClient";
