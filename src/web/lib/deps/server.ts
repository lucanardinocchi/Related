import {
  AuthClient,
  CandidatesClient,
  ChatsClient,
  CommsPlatformMessagesClient,
  EventsClient,
  GroupsClient,
  InteractionsClient,
  OnboardingClient,
  SubscriptionsClient,
  OpenThreadsClient,
  RelationshipsClient,
  UserContextClient,
  UserProviderTokensClient,
  ValuesAlignmentClient,
  MessagesClient,
} from "@related/shared";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Server-side dep factory. Constructs every @related/shared client wired
 * to the request's authenticated Supabase server client. Each route
 * destructures just what it needs.
 */
export async function getServerDeps() {
  const supabase = await createServerSupabase();

  const resolveOwnerId = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("No signed-in user");
    return data.user.id;
  };

  return {
    supabase,
    resolveOwnerId,
    auth: new AuthClient(supabase),
    relationships: new RelationshipsClient(supabase),
    openThreads: new OpenThreadsClient(supabase),
    interactions: new InteractionsClient(supabase),
    events: new EventsClient(supabase),
    commsPlatformMessages: new CommsPlatformMessagesClient(supabase),
    groups: new GroupsClient(supabase),
    candidates: new CandidatesClient(supabase),
    chats: new ChatsClient(supabase),
    userContext: new UserContextClient(supabase, resolveOwnerId),
    valuesAlignment: new ValuesAlignmentClient(supabase, resolveOwnerId),
    onboarding: new OnboardingClient(supabase, resolveOwnerId),
    subscriptions: new SubscriptionsClient(supabase),
    userProviderTokens: new UserProviderTokensClient(supabase, resolveOwnerId),
    messages: new MessagesClient(supabase),
  };
}
