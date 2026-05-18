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
  AuthClient,
  CandidatesClient,
  GroupsClient,
  InteractionsClient,
  OpenThreadsClient,
  RelationshipsClient,
  UserContextClient,
} from "@related/shared";
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
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
const authClient = new AuthClient(supabase);
const relationshipsClient = new RelationshipsClient(supabase);
const openThreadsClient = new OpenThreadsClient(supabase);
const interactionsClient = new InteractionsClient(supabase);
const groupsClient = new GroupsClient(supabase);
const candidatesClient = new CandidatesClient(supabase);
const userContextClient = new UserContextClient(supabase, async () => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("UserContextClient: no signed-in user");
  return data.user.id;
});

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
      />
      <StatusBar style="auto" />
    </>
  );
}
