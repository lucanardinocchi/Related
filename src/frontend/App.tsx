import { Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_900Black,
} from "@expo-google-fonts/inter-tight";
import { createClient } from "@supabase/supabase-js";
import {
  AgentService,
  AuthClient,
  CandidatesClient,
  GroupsClient,
  InteractionsClient,
  OnboardingClient,
  OpenThreadsClient,
  RelationshipsClient,
  SystemLinkingComposer,
  UserContextClient,
  UserProviderTokensClient,
} from "@related/shared";
import { Platform } from "react-native";
import { AuthGate } from "./src/AuthGate";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Check src/frontend/.env.",
  );
}

// One SupabaseClient shared across the app so auth state and PostgREST
// queries use the same JWT and storage.
//
// `persistSession: true` is required for the OAuth-redirect-back flow
// (ADR-0006): the User leaves the app for Google consent and returns;
// without persistence the in-memory session is lost. On web the default
// storage (localStorage) handles this. On native a future slice wires
// `expo-secure-store` or AsyncStorage.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});
const authClient = new AuthClient(supabase);
const relationshipsClient = new RelationshipsClient(supabase);
const openThreadsClient = new OpenThreadsClient(supabase);
const interactionsClient = new InteractionsClient(supabase);
const groupsClient = new GroupsClient(supabase);
const candidatesClient = new CandidatesClient(supabase);
const resolveOwnerId = async () => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("No signed-in user");
  return data.user.id;
};
const userContextClient = new UserContextClient(supabase, resolveOwnerId);
const onboardingClient = new OnboardingClient(supabase, resolveOwnerId);
const userProviderTokensClient = new UserProviderTokensClient(
  supabase,
  resolveOwnerId,
);
const messageComposer = new SystemLinkingComposer({
  openURL: (url) => Linking.openURL(url),
});
const agentService = new AgentService({ supabase, messageComposer });

// Where Supabase sends the User back after OAuth consent.
// Web: same origin (Vercel URL or localhost during dev).
// Native: a custom URL scheme — set up alongside the iOS native build.
const oauthRedirectTo =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : "related://oauth-callback";

const navigate = (url: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.href = url;
  } else {
    void Linking.openURL(url);
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    InterTight_900Black,
  });

  if (!fontsLoaded) return null;

  return (
    <>
      <AuthGate
        authClient={authClient}
        relationshipsClient={relationshipsClient}
        openThreadsClient={openThreadsClient}
        interactionsClient={interactionsClient}
        groupsClient={groupsClient}
        candidatesClient={candidatesClient}
        userContextClient={userContextClient}
        onboardingClient={onboardingClient}
        agentService={agentService}
        userProviderTokensClient={userProviderTokensClient}
        oauthRedirectTo={oauthRedirectTo}
        navigate={navigate}
      />
      <StatusBar style="auto" />
    </>
  );
}
