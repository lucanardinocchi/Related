import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_900Black,
} from "@expo-google-fonts/inter-tight";
import { AuthClient } from "@related/shared";
import { AuthGate } from "./src/AuthGate";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Check src/frontend/.env.",
  );
}

const authClient = AuthClient.fromConfig({
  supabaseUrl,
  supabaseAnonKey,
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
      <AuthGate authClient={authClient} />
      <StatusBar style="auto" />
    </>
  );
}
