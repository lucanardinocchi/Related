import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getServerDeps } from "@/lib/deps/server";
import { EventDetailView } from "./_EventDetailView";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const { events, relationships } = await getServerDeps();

  let event;
  try {
    event = await events.getEvent(id);
  } catch {
    notFound();
  }

  // Contacts come from the relationships client (same source the
  // /relationships index reads). Used to populate the attendee picker.
  const allRelationships = await relationships.listRelationships();
  const allContacts = allRelationships.map((r) => ({
    id: r.contact.id,
    name: r.contact.name,
  }));

  return (
    <div className="space-y-2">
      <Link
        href="/calendar"
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-fg-muted hover:bg-hover hover:text-fg"
      >
        <ChevronLeft size={14} /> Calendar
      </Link>

      <EventDetailView event={event} allContacts={allContacts} />
    </div>
  );
}
