import {
  AuthClient,
  CalendarEventsClient,
  CandidatesClient,
  ChatsClient,
  GroupsClient,
  InteractionsClient,
  OnboardingClient,
  OpenThreadsClient,
  RelationshipsClient,
  UserContextClient,
  UserProviderTokensClient,
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
    calendarEvents: new CalendarEventsClient(supabase),
    groups: new GroupsClient(supabase),
    candidates: new CandidatesClient(supabase),
    chats: new ChatsClient(supabase),
    userContext: new UserContextClient(supabase, resolveOwnerId),
    onboarding: new OnboardingClient(supabase, resolveOwnerId),
    userProviderTokens: new UserProviderTokensClient(supabase, resolveOwnerId),
  };
}
