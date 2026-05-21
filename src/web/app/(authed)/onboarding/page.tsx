import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — integration setup now lives on /settings. */
export default function OnboardingPage() {
  redirect("/settings");
}
