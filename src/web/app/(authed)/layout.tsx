import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AuthedLayoutShell } from "./_AuthedLayoutShell";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/sign-in");
  }

  return (
    <AuthedLayoutShell userEmail={user.email}>{children}</AuthedLayoutShell>
  );
}
