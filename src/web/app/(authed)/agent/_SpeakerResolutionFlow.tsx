"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PocketClient,
  PocketSpeakerAmbiguity,
  PocketSpeakerAssignment,
  PocketTranscriptSegment,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import {
  normalizeSpeakerKey,
  POCKET_UNLABELED_SPEAKER,
  speakerKeysFromTranscript,
} from "@related/shared";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";

const DISMISS_PROMPT_KEY = "related.agent.speakerResolutionPromptDismissed";

function speakerDisplayLabel(key: string): string {
  if (key === POCKET_UNLABELED_SPEAKER) return "Unlabeled";
  return key;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface SpeakerResolutionFlowProps {
  pocket: PocketClient;
  relationships: RelationshipsClient;
  ambiguities: PocketSpeakerAmbiguity[];
  open: boolean;
  onClose: () => void;
  onResolved: (chatId: string) => void;
  /** When set, open directly on this recording's resolution panel. */
  initialRecordingId?: string | null;
}

export function useSpeakerResolutionPrompt(
  ambiguityCount: number,
): {
  promptOpen: boolean;
  openPrompt: () => void;
  dismissPrompt: () => void;
} {
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (ambiguityCount === 0) return;
    try {
      if (sessionStorage.getItem(DISMISS_PROMPT_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    setPromptOpen(true);
  }, [ambiguityCount]);

  return {
    promptOpen,
    openPrompt: () => setPromptOpen(true),
    dismissPrompt: () => {
      try {
        sessionStorage.setItem(DISMISS_PROMPT_KEY, "1");
      } catch {
        /* ignore */
      }
      setPromptOpen(false);
    },
  };
}

export function SpeakerResolutionPromptModal({
  count,
  open,
  onResolveNow,
  onLater,
}: {
  count: number;
  open: boolean;
  onResolveNow: () => void;
  onLater: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onLater}
      title="Resolve speaker labels"
      subtitle={`${count} Pocket recording${count === 1 ? "" : "s"} need speaker labels before they can update your relationship timelines.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onLater}>
            Later
          </Button>
          <Button variant="primary" size="sm" onClick={onResolveNow}>
            Resolve now
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-[20px] text-fg-muted">
        Match each voice in the transcript to you or a contact. Imported
        Pocket chats will then appear in this list with a Pocket label.
      </p>
    </Modal>
  );
}

export function SpeakerResolutionFlow({
  pocket,
  relationships,
  ambiguities,
  open,
  onClose,
  onResolved,
  initialRecordingId,
}: SpeakerResolutionFlowProps) {
  const [step, setStep] = useState<"list" | "resolve">("list");
  const [selected, setSelected] = useState<PocketSpeakerAmbiguity | null>(null);
  const [assignments, setAssignments] = useState<
    Record<string, PocketSpeakerAssignment | undefined>
  >({});
  const [contacts, setContacts] = useState<Relationship[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addForSpeaker, setAddForSpeaker] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState("");

  const loadContacts = useCallback(async () => {
    const rows = await relationships.listRelationships();
    setContacts(rows);
  }, [relationships]);

  useEffect(() => {
    if (!open) return;
    void loadContacts();
    if (initialRecordingId) {
      const item = ambiguities.find((a) => a.recordingId === initialRecordingId);
      if (item) {
        setSelected(item);
        setStep("resolve");
        setAssignments({});
      }
    } else {
      setStep(ambiguities.length === 1 ? "resolve" : "list");
      if (ambiguities.length === 1) {
        setSelected(ambiguities[0] ?? null);
        setAssignments({});
      }
    }
  }, [open, initialRecordingId, ambiguities, loadContacts]);

  const speakerKeys = useMemo(() => {
    if (!selected) return [];
    const segments = selected.transcriptSegments;
    if (segments.length > 0) return speakerKeysFromTranscript(segments);
    return selected.speakers.map((s) => normalizeSpeakerKey(s));
  }, [selected]);

  const segments: PocketTranscriptSegment[] = useMemo(
    () => selected?.transcriptSegments ?? [],
    [selected],
  );

  const allAssigned = useMemo(() => {
    if (speakerKeys.length === 0) return false;
    const values = speakerKeys.map((k) => assignments[k]);
    if (values.some((v) => !v)) return false;
    return values.filter((v) => v?.kind === "self").length === 1;
  }, [speakerKeys, assignments]);

  const openResolve = (item: PocketSpeakerAmbiguity) => {
    setSelected(item);
    setAssignments({});
    setError(null);
    setAddForSpeaker(null);
    setStep("resolve");
  };

  const handleAddContact = async (speakerKey: string) => {
    const name = newContactName.trim();
    if (!name) return;
    setWorking(true);
    setError(null);
    try {
      const contact = await relationships.createContact({ name });
      await loadContacts();
      setAssignments((prev) => ({
        ...prev,
        [speakerKey]: { kind: "contact", contactId: contact.id },
      }));
      setAddForSpeaker(null);
      setNewContactName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected || !allAssigned) return;
    const payload: Record<string, PocketSpeakerAssignment> = {};
    for (const key of speakerKeys) {
      const a = assignments[key];
      if (!a) return;
      payload[key] = a;
    }
    setWorking(true);
    setError(null);
    try {
      const { chatId } = await pocket.resolveSpeakers({
        recordingId: selected.recordingId,
        assignments: payload,
      });
      onResolved(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  if (!open) return null;

  if (step === "list") {
    return (
      <Modal
        open
        onClose={onClose}
        title="Unresolved Pocket transcripts"
        subtitle="Pick a recording to assign speakers"
        size="lg"
      >
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {ambiguities.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => openResolve(item)}
                className="w-full rounded-md border border-border px-3 py-3 text-left transition-colors hover:bg-hover"
              >
                <div className="text-[14px] font-medium text-fg">
                  {item.recordingTitle ?? "Untitled recording"}
                </div>
                {item.recordingCreatedAt ? (
                  <div className="mt-0.5 text-[12px] text-fg-muted">
                    {formatWhen(item.recordingCreatedAt)}
                  </div>
                ) : null}
                <div className="mt-1 text-[12px] text-fg-muted">
                  Speakers: {item.speakers.join(", ") || "—"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  if (!selected) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={selected.recordingTitle ?? "Resolve speakers"}
      subtitle={
        selected.recordingCreatedAt
          ? formatWhen(selected.recordingCreatedAt)
          : "Match each voice to you or a contact"
      }
      size="lg"
      footer={
        <>
          {ambiguities.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={working}
              onClick={() => {
                setStep("list");
                setSelected(null);
              }}
            >
              Back
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" disabled={working} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={working}
            disabled={!allAssigned}
            onClick={() => void handleSubmit()}
          >
            Import transcript
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-fg">Assign speakers</p>
          {speakerKeys.map((key) => {
            const current = assignments[key];
            return (
              <div
                key={key}
                className="rounded-md border border-border p-3"
              >
                <div className="text-[14px] font-medium text-fg">
                  {speakerDisplayLabel(key)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant={current?.kind === "self" ? "primary" : "secondary"}
                    size="sm"
                    disabled={working}
                    onClick={() =>
                      setAssignments((prev) => ({
                        ...prev,
                        [key]: { kind: "self" },
                      }))
                    }
                  >
                    This is me
                  </Button>
                  <Button
                    variant={
                      current?.kind === "contact" ? "primary" : "secondary"
                    }
                    size="sm"
                    disabled={working}
                    onClick={() => {
                      const first = contacts[0];
                      if (first) {
                        setAssignments((prev) => ({
                          ...prev,
                          [key]: {
                            kind: "contact",
                            contactId: first.contact.id,
                          },
                        }));
                      } else {
                        setAddForSpeaker(key);
                        setNewContactName(
                          key === POCKET_UNLABELED_SPEAKER ? "" : key,
                        );
                      }
                    }}
                  >
                    A contact
                  </Button>
                </div>
                {current?.kind === "contact" ? (
                  <label className="mt-2 block text-[12px] text-fg-muted">
                    Contact
                    <select
                      className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] text-fg"
                      value={current.contactId}
                      disabled={working}
                      onChange={(e) =>
                        setAssignments((prev) => ({
                          ...prev,
                          [key]: {
                            kind: "contact",
                            contactId: e.target.value,
                          },
                        }))
                      }
                    >
                      {contacts.map((r) => (
                        <option key={r.contact.id} value={r.contact.id}>
                          {r.contact.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {addForSpeaker === key ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      placeholder="Contact name"
                      className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-[13px]"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={working}
                      onClick={() => void handleAddContact(key)}
                    >
                      Add
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-2 text-[12px] text-accent hover:underline"
                    onClick={() => {
                      setAddForSpeaker(key);
                      setNewContactName(
                        key === POCKET_UNLABELED_SPEAKER ? "" : key,
                      );
                    }}
                  >
                    + Add new contact
                  </button>
                )}
              </div>
            );
          })}
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : null}
        </div>

        <div>
          <p className="text-[13px] font-medium text-fg">Transcript preview</p>
          <div className="mt-2 max-h-[50vh] space-y-2 overflow-y-auto rounded-md border border-border bg-bg-subtle p-3">
            {segments.length === 0 ? (
              <p className="text-[13px] text-fg-muted">
                No preview stored — speakers listed above still need assignment
                before import.
              </p>
            ) : (
              segments.map((seg, i) => {
                const key = normalizeSpeakerKey(seg.speaker);
                const label = speakerDisplayLabel(key);
                const assigned = assignments[key];
                const who =
                  assigned?.kind === "self"
                    ? "You"
                    : assigned?.kind === "contact"
                      ? contacts.find((r) => r.contact.id === assigned.contactId)
                          ?.contact.name ?? "Contact"
                      : label;
                return (
                  <div key={i} className="text-[13px] leading-[20px]">
                    <span className="font-medium text-fg-muted">{who}: </span>
                    <span className="text-fg">{seg.text?.trim()}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
