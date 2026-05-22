import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RelationshipContextBuilder,
  type RelationshipContextContact,
  type RelationshipContextInteraction,
  type RelationshipContextOpenThreadLink,
} from "./RelationshipContextBuilder";

jest.mock("./loadRelationshipAmbientContext", () => ({
  loadRelationshipAmbientExtras: jest.fn().mockResolvedValue({
    platformComms: [],
    calendarEvents: [],
    suggestedActionHistory: [],
  }),
}));

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const limit = jest.fn<Promise<Resolved<unknown>>, []>();
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const eqInner = jest.fn(() => ({ single, order, limit }));
  const eq = jest.fn(() => ({ single, order, limit, eq: eqInner }));
  const select = jest.fn(() => ({ single, order, eq, limit }));
  const from = jest.fn((_t: string) => ({ select }));
  return { from, select, single, eq, eqInner, order, limit };
}

const fullContact = (over: Partial<RelationshipContextContact> = {}): RelationshipContextContact => ({
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
});

describe("RelationshipContextBuilder.buildRelationshipContext", () => {
  it("returns a minimal snapshot when no supabase client is wired", async () => {
    const builder = new RelationshipContextBuilder();
    const snapshot = await builder.buildRelationshipContext("r-1");

    expect(snapshot).toEqual({
      relationship: { id: "r-1" },
      interactions: [],
      openThreads: [],
      contact: null,
      groupMembers: [],
      platformComms: [],
      calendarEvents: [],
      suggestedActionHistory: [],
    });
  });

  it("loads full contact relationship context including interactions and open threads", async () => {
    const q = makeQueryMock();
    const relationship = {
      id: "r-1",
      owner_id: "u-1",
      target_type: "contact",
      target_contact_id: "c-1",
      target_group_id: null,
      role: "close friend",
      cadence: "weekly",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      contact: fullContact(),
    };
    const interactions: RelationshipContextInteraction[] = [
      {
        id: "i-1",
        time: "2026-05-18T20:00:00Z",
        kind: "dinner",
        category: "personal",
        notes: null,
        status: "occurred",
        group_id: null,
        created_at: "2026-05-18T20:00:00Z",
        updated_at: "2026-05-18T20:00:00Z",
        interaction_contacts: [
          { contact_id: "c-1", contacts: { id: "c-1", name: "Sam" } },
        ],
      },
    ];
    const openThreads: RelationshipContextOpenThreadLink[] = [
      {
        open_threads: {
          id: "ot-1",
          description: "send the book",
          direction: "me_owes_them",
          origin: null,
          communication_status: "not_communicated",
          created_at: "2026-05-10T00:00:00Z",
          closed_at: null,
        },
      },
    ];

    q.single.mockResolvedValueOnce({ data: relationship, error: null });
    q.order
      .mockResolvedValueOnce({ data: interactions, error: null })
      .mockResolvedValueOnce({ data: openThreads, error: null });

    const supa = { from: q.from } as unknown as SupabaseClient;
    const builder = new RelationshipContextBuilder({ supabase: supa });
    const snapshot = await builder.buildRelationshipContext("r-1");

    expect(snapshot.relationship).toEqual({
      ...relationship,
      contact: relationship.contact,
      group: null,
    });
    expect(snapshot.interactions).toEqual(interactions);
    expect(snapshot.openThreads).toEqual(openThreads);
    expect(snapshot.contact).toEqual(relationship.contact);
    expect(snapshot.groupMembers).toEqual([]);
    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.from).toHaveBeenCalledWith("interactions");
    expect(q.from).toHaveBeenCalledWith("open_thread_relationships");
  });

  it("loads group members for group-targeted relationships", async () => {
    const q = makeQueryMock();
    const relationship = {
      id: "r-grp",
      owner_id: "u-1",
      target_type: "group",
      target_contact_id: null,
      target_group_id: "g-1",
      role: null,
      cadence: null,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      group: {
        id: "g-1",
        name: "College friends",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    };
    const groupMembers = [
      {
        contact_id: "c-1",
        contacts: fullContact({ id: "c-1", name: "Sam", email: null }),
      },
      {
        contact_id: "c-2",
        contacts: fullContact({ id: "c-2", name: "Alex", email: null }),
      },
    ];

    q.single
      .mockResolvedValueOnce({ data: relationship, error: null })
      .mockResolvedValueOnce({
        data: { contact_groups: groupMembers },
        error: null,
      });
    q.order
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const supa = { from: q.from } as unknown as SupabaseClient;
    const builder = new RelationshipContextBuilder({ supabase: supa });
    const snapshot = await builder.buildRelationshipContext("r-grp");

    expect(snapshot.contact).toBeNull();
    expect(snapshot.groupMembers).toEqual(groupMembers);
    expect(snapshot.relationship.group).toEqual(relationship.group);
    expect(q.from).toHaveBeenCalledWith("groups");
  });
});
