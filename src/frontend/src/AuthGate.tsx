import { useEffect, useState } from "react";
import type {
  AuthClient,
  RelationshipsClient,
  Session,
} from "@related/shared";
import { AuthedApp } from "./AuthedApp";
import { SignInScreen } from "./SignInScreen";

export interface AuthGateProps {
  authClient: AuthClient;
  relationshipsClient: RelationshipsClient;
}

export function AuthGate({ authClient, relationshipsClient }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      setLoaded(true);
    });
    const unsubscribe = authClient.onAuthStateChange(setSession);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authClient]);

  if (!loaded) return null;

  if (!session) {
    return <SignInScreen authClient={authClient} onSignedIn={setSession} />;
  }

  return (
    <AuthedApp
      relationshipsClient={relationshipsClient}
      onSignOut={() => {
        void authClient.signOut();
      }}
    />
  );
}
