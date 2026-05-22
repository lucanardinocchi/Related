import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/marketing/LandingPage";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Related | Ambient relationship intelligence",
  description:
    "Stay close to the people you care about. Related runs in the background and surfaces Candidate Actions you can accept, edit, or decline.",
  openGraph: {
    title: "Related | Ambient relationship intelligence",
    description:
      "Stay close to the people you care about. Background intelligence for real relationships.",
  },
};

export default async function MarketingHomePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/relationships");
  }

  return <LandingPage />;
}
