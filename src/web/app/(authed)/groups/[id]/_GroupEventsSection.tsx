"use client";

import { EventsSection } from "../../relationships/[id]/_EventsSection";

interface Props {
  groupName: string;
  groupMemberIds: string[];
}

export function GroupEventsSection({ groupName, groupMemberIds }: Props) {
  return (
    <EventsSection contactIds={groupMemberIds} contextName={groupName} />
  );
}
