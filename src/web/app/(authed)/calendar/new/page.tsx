import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getServerDeps } from "@/lib/deps/server";
import { NewEventForm } from "./_NewEventForm";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const { relationships } = await getServerDeps();
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

      <NewEventForm allContacts={allContacts} />
    </div>
  );
}
