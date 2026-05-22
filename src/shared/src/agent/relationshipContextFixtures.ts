import type {
  RelationshipContextContact,
  RelationshipContextOpenThreadLink,
  RelationshipContextSnapshot,
} from "./RelationshipContextBuilder";

/** Full contact row shape for agent prompt fixtures. */
export function testContact(
  over: Partial<RelationshipContextContact> = {},
): RelationshipContextContact {
  return {
    id: "c-1",
    name: "Sam",
    phone: null,
    email: "sam@example.com",
    birthday: null,
    area: null,
    latitude: null,
    longitude: null,
    occupation: null,
    education: null,
    instagram_username: null,
    instagram_scoped_id: null,
    x_username: null,
    x_user_id: null,
    tiktok_username: null,
    tiktok_open_id: null,
    whatsapp_wa_id: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...over,
  };
}

export function testOpenThreadLink(
  over: Partial<RelationshipContextOpenThreadLink["open_threads"]> = {},
): RelationshipContextOpenThreadLink {
  return {
    open_threads: {
      id: "ot-1",
      description: "promised to send the book",
      direction: "me_owes_them",
      origin: null,
      communication_status: "not_communicated",
      created_at: "2026-05-10T00:00:00Z",
      closed_at: null,
      ...over,
    },
  };
}

export function testRelationshipContextSnapshot(
  over: Partial<RelationshipContextSnapshot> = {},
): RelationshipContextSnapshot {
  const contact = testContact();
  return {
    relationship: {
      id: "r-1",
      owner_id: "u-1",
      target_type: "contact",
      contact,
      role: "close friend",
      cadence: "every couple of weeks",
    },
    interactions: [],
    openThreads: [],
    contact,
    groupMembers: [],
    ...over,
  };
}
