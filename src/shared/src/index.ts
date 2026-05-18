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

export { InteractionsClient } from "./interactions/InteractionsClient";
export type {
  Interaction,
  InteractionStatus,
  InteractionContact,
  CreateInteractionInput,
  InteractionsClientConfig,
} from "./interactions/InteractionsClient";
