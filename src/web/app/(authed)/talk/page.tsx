import { redirect } from "next/navigation";

// ADR-0008: /agent replaces /talk. This route preserves existing links
// (notification CTAs, old browser tabs, mobile deep-links) by redirecting
// to the new surface.
export const dynamic = "force-dynamic";

export default function TalkRedirect() {
  redirect("/agent");
}
