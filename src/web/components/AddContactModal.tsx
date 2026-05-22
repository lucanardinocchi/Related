"use client";

import { useCallback, useEffect, useState } from "react";
import type { Contact, RelationshipsClient } from "@related/shared";
import { FormField } from "@/components/ui/FormField";
import { Button, Input, Modal, LocationPicker } from "@/components/ui";
import type { ContactLocationValue } from "@/components/ui";

export interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  relationships: RelationshipsClient;
  /** Prefill name (e.g. diarized speaker label). */
  initialName?: string;
  onCreated: (contact: Contact) => void;
}

/**
 * Add-contact form matching the individual essentials + extras steps from
 * NewRelationshipModal on the relationships page.
 */
export function AddContactModal({
  open,
  onClose,
  relationships,
  initialName = "",
  onCreated,
}: AddContactModalProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [location, setLocation] = useState<ContactLocationValue>({
    area: null,
    latitude: null,
    longitude: null,
  });
  const [occupation, setOccupation] = useState("");
  const [education, setEducation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName(initialName);
    setPhone("");
    setEmail("");
    setBirthday("");
    setLocation({ area: null, latitude: null, longitude: null });
    setOccupation("");
    setEducation("");
    setSubmitting(false);
    setError(null);
  }, [initialName]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  async function submit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const contact = await relationships.createContact({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        birthday: birthday.trim() || null,
        area: location.area,
        latitude: location.latitude,
        longitude: location.longitude,
        occupation: occupation.trim() || null,
        education: education.trim() || null,
      });
      onCreated(contact);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create contact.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contact"
      subtitle="Same fields as when you add a relationship on the Relationships page."
      size="md"
      className="flex max-h-[min(85vh,720px)] flex-col"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={submitting}>
            Create contact
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[min(52vh,420px)] space-y-4 overflow-y-auto px-5">
        <FormField label="Name" htmlFor="add-contact-name">
          <Input
            id="add-contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoFocus
          />
        </FormField>
        <FormField label="Phone" htmlFor="add-contact-phone" hint="Optional">
          <Input
            id="add-contact-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61 …"
            type="tel"
          />
        </FormField>
        <FormField label="Email" htmlFor="add-contact-email" hint="Optional">
          <Input
            id="add-contact-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            type="email"
            autoCapitalize="none"
          />
        </FormField>
        <FormField label="Birthday" htmlFor="add-contact-birthday" hint="Optional">
          <Input
            id="add-contact-birthday"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </FormField>
        <FormField label="Location" htmlFor="add-contact-location" hint="Optional">
          <LocationPicker
            value={location}
            onChange={setLocation}
            placeholder="Search city, suburb, or neighbourhood…"
          />
        </FormField>
        <FormField label="Occupation" htmlFor="add-contact-occupation" hint="Optional">
          <Input
            id="add-contact-occupation"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="Job title or field"
          />
        </FormField>
        <FormField label="Education" htmlFor="add-contact-education" hint="Optional">
          <Input
            id="add-contact-education"
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="School, degree, or program"
          />
        </FormField>
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
