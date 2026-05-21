"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { User, Users } from "lucide-react";
import { getBrowserDeps } from "@/lib/deps/client";
import { cn } from "@/lib/cn";
import { FormField } from "@/components/ui/FormField";
import { Badge, Button, Checkbox, Input, Modal } from "@/components/ui";

type Step = "kind" | "essentials" | "extras";
type Kind = "individual" | "group";

export interface ContactOption {
  id: string;
  name: string;
}

interface Props {
  contacts: ContactOption[];
}

const STEP_NUMBER: Record<Step, number> = {
  kind: 1,
  essentials: 2,
  extras: 3,
};

function stepSubtitle(step: Step, kind: Kind | null): string {
  if (step === "kind") return "Choose what you are adding.";
  if (step === "essentials") {
    return kind === "group"
      ? "Give the group a name."
      : "Add the basics for this contact.";
  }
  if (kind === "group") return "Optionally add existing contacts as members.";
  return "Optional profile details — skip if you are not sure yet.";
}

function stepTitle(step: Step, kind: Kind | null): string {
  if (step === "kind") return "New relationship";
  if (step === "essentials") {
    return kind === "group" ? "Group details" : "Contact details";
  }
  return kind === "group" ? "Members" : "Additional details";
}

export function NewRelationshipModal({ contacts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get("new") === "1";

  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<Kind | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [area, setArea] = useState("");
  const [occupation, setOccupation] = useState("");
  const [education, setEducation] = useState("");

  const [memberSearch, setMemberSearch] = useState("");
  const [pickedContactIds, setPickedContactIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setStep("kind");
    setKind(null);
    setName("");
    setPhone("");
    setEmail("");
    setBirthday("");
    setArea("");
    setOccupation("");
    setEducation("");
    setMemberSearch("");
    setPickedContactIds([]);
    setSubmitting(false);
    setError(null);
  }, []);

  const close = useCallback(() => {
    router.push("/relationships", { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  function toggleMember(contactId: string) {
    setPickedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  const filteredContacts = contacts.filter((contact) =>
    memberSearch === ""
      ? true
      : contact.name.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const canContinue =
    step === "kind"
      ? kind !== null
      : step === "essentials"
        ? name.trim().length > 0
        : true;

  function goBack() {
    setError(null);
    if (step === "extras") {
      setStep("essentials");
      return;
    }
    if (step === "essentials") {
      setStep("kind");
    }
  }

  function goNext() {
    setError(null);
    if (step === "kind" && kind) {
      setStep("essentials");
      return;
    }
    if (step === "essentials") {
      setStep("extras");
    }
  }

  async function submit() {
    if (submitting || !kind) return;
    if (!name.trim()) {
      setError("Name is required.");
      setStep("essentials");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const deps = getBrowserDeps();

      if (kind === "individual") {
        const contact = await deps.relationships.createContact({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          birthday: birthday.trim() || null,
          area: area.trim() || null,
          occupation: occupation.trim() || null,
          education: education.trim() || null,
        });

        const relationships = await deps.relationships.listRelationships();
        const relationship = relationships.find(
          (relationship) => relationship.contact.id === contact.id,
        );

        if (relationship) {
          router.push(`/relationships/${relationship.id}`);
        } else {
          router.push("/relationships");
        }
        router.refresh();
        return;
      }

      const group = await deps.groups.createGroup({ name: name.trim() });
      await Promise.all(
        pickedContactIds.map((contactId) =>
          deps.groups.addMember({ groupId: group.id, contactId }),
        ),
      );

      router.push(`/groups/${group.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create relationship.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <>
      {step !== "kind" ? (
        <Button variant="ghost" onClick={goBack} disabled={submitting}>
          Back
        </Button>
      ) : (
        <Button variant="ghost" onClick={close} disabled={submitting}>
          Cancel
        </Button>
      )}
      {step === "extras" ? (
        <Button variant="primary" onClick={submit} loading={submitting}>
          Create
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={goNext}
          disabled={!canContinue || submitting}
        >
          Continue
        </Button>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={stepTitle(step, kind)}
      subtitle={`Step ${STEP_NUMBER[step]} of 3 · ${stepSubtitle(step, kind)}`}
      footer={footer}
      size="md"
      className="flex max-h-[min(85vh,720px)] flex-col"
    >
      <div className="-mx-5 max-h-[min(52vh,420px)] overflow-y-auto px-5">
        {step === "kind" && (
          <div className="space-y-3">
            <KindOption
              selected={kind === "individual"}
              icon={<User size={18} className="text-fg-subtle" />}
              title="Individual"
              description="One person in your network."
              onSelect={() => setKind("individual")}
            />
            <KindOption
              selected={kind === "group"}
              icon={<Users size={18} className="text-fg-subtle" />}
              title="Group"
              description="A shared context with multiple people."
              onSelect={() => setKind("group")}
            />
          </div>
        )}

        {step === "essentials" && kind === "individual" && (
          <div className="space-y-4">
            <FormField label="Name" htmlFor="contact-name">
              <Input
                id="contact-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
                autoFocus
              />
            </FormField>
            <FormField label="Phone" htmlFor="contact-phone" hint="Optional">
              <Input
                id="contact-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+61 …"
                type="tel"
              />
            </FormField>
            <FormField label="Email" htmlFor="contact-email" hint="Optional">
              <Input
                id="contact-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
              />
            </FormField>
          </div>
        )}

        {step === "essentials" && kind === "group" && (
          <FormField label="Group name" htmlFor="group-name">
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Book club, Work team"
              autoFocus
            />
          </FormField>
        )}

        {step === "extras" && kind === "individual" && (
          <div className="space-y-4">
            <FormField label="Birthday" htmlFor="contact-birthday" hint="Optional">
              <Input
                id="contact-birthday"
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </FormField>
            <FormField label="Area" htmlFor="contact-area" hint="Optional">
              <Input
                id="contact-area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="City or neighbourhood"
              />
            </FormField>
            <FormField label="Occupation" htmlFor="contact-occupation" hint="Optional">
              <Input
                id="contact-occupation"
                value={occupation}
                onChange={(event) => setOccupation(event.target.value)}
                placeholder="What they do"
              />
            </FormField>
            <FormField
              label="Education"
              htmlFor="contact-education"
              hint="Optional"
            >
              <Input
                id="contact-education"
                value={education}
                onChange={(event) => setEducation(event.target.value)}
                placeholder="School, degree, etc."
              />
            </FormField>
          </div>
        )}

        {step === "extras" && kind === "group" && (
          <div className="space-y-3">
            <Input
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Search contacts"
            />
            {contacts.length === 0 ? (
              <p className="text-[14px] text-fg-subtle">
                No contacts yet. You can add members later from the group page.
              </p>
            ) : filteredContacts.length === 0 ? (
              <p className="text-[14px] text-fg-subtle">No matching contacts.</p>
            ) : (
              <ul className="divide-y divide-divider rounded-md border border-divider">
                {filteredContacts.map((contact) => {
                  const checked = pickedContactIds.includes(contact.id);
                  return (
                    <li key={contact.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-hover">
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleMember(contact.id)}
                        />
                        <span className="text-[14px]">{contact.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4">
            <Badge tone="danger">{error}</Badge>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface KindOptionProps {
  selected: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}

function KindOption({
  selected,
  icon,
  title,
  description,
  onSelect,
}: KindOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        selected
          ? "border-accent bg-accent/5"
          : "border-divider hover:bg-hover",
      )}
    >
      {icon}
      <div>
        <div className="text-[14px] font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-[13px] text-fg-muted">{description}</div>
      </div>
    </button>
  );
}
