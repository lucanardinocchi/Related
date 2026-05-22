import { redirect } from "next/navigation";
import { tokenHasGmailAccess } from "@related/shared";
import { getServerDeps } from "@/lib/deps/server";
import { AuthedLayoutShell } from "./_AuthedLayoutShell";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, userProviderTokens } = await getServerDeps();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/sign-in");
  }

  const googleToken = await userProviderTokens.getForProvider("google");
  const gmailConnected = tokenHasGmailAccess(googleToken?.scopes);

  return (
    <AuthedLayoutShell
      userEmail={user.email}
      gmailConnected={gmailConnected}
    >
      {children}
    </AuthedLayoutShell>
  );
}
