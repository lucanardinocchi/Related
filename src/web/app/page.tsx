import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // ADR-0008: web is now primary; /relationships is the default landing
  // for signed-in Users (replaces /context which is settings-shaped).
  redirect(user ? "/relationships" : "/sign-in");
}
