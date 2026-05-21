"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface GroupMemberSummary {
  id: string;
  name: string;
  relationshipId: string | null;
}

interface Props {
  members: GroupMemberSummary[];
}

const PERSON_COLORS = [
  "#2383e2",
  "#0f7c4a",
  "#b06d00",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#c2410c",
  "#4f46e5",
];

const MAX_VISIBLE = 10;

function personColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length]!;
}

function PersonFigure({
  member,
  index,
  total,
  highlighted,
  onHighlight,
  suppressClick,
}: {
  member: GroupMemberSummary;
  index: number;
  total: number;
  highlighted: string | null;
  onHighlight: (id: string | null) => void;
  suppressClick: () => boolean;
}) {
  const angle = (index / total) * 360;
  const color = personColor(index);
  const isHighlighted = highlighted === member.id;

  const body = (
    <div
      className={cn(
        "flex flex-col items-center transition-transform duration-150",
        isHighlighted && "scale-110",
      )}
      style={{ transform: `rotateY(${-angle}deg)` }}
      onPointerEnter={() => onHighlight(member.id)}
      onPointerLeave={() => onHighlight(null)}
    >
      <div
        className="rounded-full shadow-sm"
        style={{
          width: 10,
          height: 10,
          backgroundColor: color,
          boxShadow: isHighlighted ? `0 0 0 2px ${color}44` : undefined,
        }}
      />
      <div
        className="mt-0.5 rounded-sm shadow-sm"
        style={{
          width: 14,
          height: 18,
          backgroundColor: color,
          opacity: 0.85,
        }}
      />
    </div>
  );

  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{
        transform: `translate(-50%, -50%) rotateY(${angle}deg) translateZ(42px)`,
        transformStyle: "preserve-3d",
      }}
    >
      {member.relationshipId ? (
        <Link
          href={`/relationships/${member.relationshipId}`}
          className="block"
          aria-label={`View ${member.name}`}
          title={member.name}
          onClick={(e) => {
            if (suppressClick()) e.preventDefault();
          }}
        >
          {body}
        </Link>
      ) : (
        <div title={member.name}>{body}</div>
      )}
    </div>
  );
}

export function GroupMembersWidget({ members }: Props) {
  const [rotation, setRotation] = useState({ x: -18, y: 24 });
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - visible.length;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    didDrag.current = false;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setRotation((r) => ({
      x: Math.max(-40, Math.min(10, r.x - dy * 0.4)),
      y: r.y + dx * 0.6,
    }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const highlightedMember = members.find((m) => m.id === highlighted);

  return (
    <div className="relative shrink-0 pb-5">
      <div
        className="relative size-32 touch-none overflow-hidden rounded-lg border border-border bg-surface select-none cursor-grab active:cursor-grabbing"
        style={{ perspective: 320 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={
          members.length === 0
            ? "No group members"
            : `Group members: ${members.map((m) => m.name).join(", ")}. Drag to rotate.`
        }
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          }}
        >
          <div
            className="absolute rounded-full bg-border/60"
            style={{
              width: 72,
              height: 72,
              transform: "rotateX(90deg) translateZ(-8px)",
            }}
          />

          {visible.length === 0 ? (
            <div
              className="flex flex-col items-center opacity-40"
              style={{ transform: "translateZ(20px)" }}
            >
              <div className="size-2.5 rounded-full bg-fg-subtle" />
              <div className="mt-0.5 h-4 w-3.5 rounded-sm bg-fg-subtle" />
            </div>
          ) : (
            visible.map((member, i) => (
              <PersonFigure
                key={member.id}
                member={member}
                index={i}
                total={visible.length}
                highlighted={highlighted}
                onHighlight={setHighlighted}
                suppressClick={() => didDrag.current}
              />
            ))
          )}
        </div>

        {overflow > 0 && (
          <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-bg/90 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted shadow-sm">
            +{overflow}
          </div>
        )}
      </div>

      {highlightedMember && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 max-w-[140px] -translate-x-1/2 truncate text-center text-[11px] text-fg-muted">
          {highlightedMember.name}
        </div>
      )}
    </div>
  );
}
