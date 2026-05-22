// Snapshot preload caps for conversational agents (chat-respond, evals).
// User Context caps align with USER_CONTEXT_CAPS in userContextCore.

import { MS_PER_DAY, USER_CONTEXT_CAPS } from "../agent/userContextCore.ts";

export { MS_PER_DAY };

export const SNAPSHOT_CAPS = {
  relationships: USER_CONTEXT_CAPS.relationships,
  groups: USER_CONTEXT_CAPS.groups,
  transientIntent: USER_CONTEXT_CAPS.transientIntent,
  openThreads: 50,
  interactions: 100,
  interactionsWindowDays: 30,
} as const;
