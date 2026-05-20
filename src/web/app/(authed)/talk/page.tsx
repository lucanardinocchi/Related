import Link from "next/link";
import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { TalkSession } from "./_TalkSession";

export const dynamic = "force-dynamic";

/**
 * /talk — Voice agent (Engaged Pass).
 *
 * Server component loads the User's Relationships so the client can show a
 * picker without an extra round-trip. All voice/recording/transcript state
 * lives in the `TalkSession` client component below.
 *
 * If the User has zero Relationships, the web app currently has no Contact
 * creation surface, so we surface a quiet "Add a Contact first" notice. The
 * native build creates Contacts.
 */
export default async function TalkPage() {
  const { relationships } = await getServerDeps();
  const list = await relationships.listRelationships();

  const initial = list.map((r) => ({
    id: r.id,
    name: r.contact.name,
    phone: r.contact.phone,
    email: r.contact.email,
  }));

  return (
    <>
      <PageHeader
        title="Talk to Claude"
        subtitle="Pick a person, hit the mic, and have a voice conversation focused on them."
      />
      {initial.length === 0 ? (
        <Card>
          <p className="text-sm">
            You don&apos;t have any Contacts yet. Add one on the mobile app to
            start a voice session here.
          </p>
          <p className="mt-2 text-xs text-muted">
            <Link href="/onboarding" className="underline">
              Or finish setup first.
            </Link>
          </p>
        </Card>
      ) : (
        <TalkSession relationships={initial} />
      )}
    </>
  );
}
