/**
 * Seed a full demo dataset for one User (default: lucanardinocchi@gmail.com).
 *
 * Usage (hosted project):
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/seed-user.mjs
 *
 * Optional: SEED_EMAIL=other@example.com node scripts/seed-user.mjs
 * Optional: SEED_CLEAR_ONLY=1 — wipe user data and exit.
 */

import { createClient } from "@supabase/supabase-js";

const EMAIL = process.env.SEED_EMAIL ?? "lucanardinocchi@gmail.com";
const CLEAR_ONLY = process.env.SEED_CLEAR_ONLY === "1";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error(
    "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Mint a short-lived user session so SECURITY INVOKER RPCs see auth.uid(). */
async function asUser(email) {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error) throw link.error;
  const otp = link.data?.properties?.email_otp;
  if (!otp) throw new Error("generateLink returned no email_otp");

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await anon.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (verified.error || !verified.data.session) {
    throw verified.error ?? new Error("verifyOtp failed");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${verified.data.session.access_token}`,
      },
    },
  });
}

const TABLES_OWNER = [
  "chat_messages",
  "chats",
  "candidate_actions",
  "candidate_sets",
  "scheduled_passes",
  "transient_intent",
  "inferred_signal_calendar",
  "inferred_signal_sleep",
  "interaction_contacts",
  "interactions",
  "open_thread_relationships",
  "open_threads",
  "contact_groups",
  "relationships",
  "contacts",
  "groups",
  "goals_and_values",
  "situational_state",
  "onboarding_state",
  "push_subscriptions",
  "notification_preferences",
  "user_provider_tokens",
];

async function findUser() {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  const user = data.users.find(
    (u) => u.email?.toLowerCase() === EMAIL.toLowerCase(),
  );
  if (!user) throw new Error(`No auth user for ${EMAIL}`);
  return user;
}

async function clearUserData(ownerId) {
  for (const table of TABLES_OWNER) {
    const { error } = await admin.from(table).delete().eq("owner_id", ownerId);
    if (error) {
      throw new Error(`clear ${table}: ${error.message}`);
    }
  }
}

function daysFromNow(n, hour = 10, durationHours = 1) {
  const start = new Date();
  start.setDate(start.getDate() + n);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + durationHours);
  return { start: start.toISOString(), end: end.toISOString() };
}

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function seed(ownerId, userClient) {
  const now = new Date().toISOString();

  // --- Contacts (relationships auto-created by trigger) ---
  const contactRows = [
    {
      name: "Sam Chen",
      phone: "+61 412 555 010",
      email: "sam.chen@example.com",
      birthday: "1992-03-14",
      area: "Newtown",
      occupation: "Product designer",
      education: "UNSW",
    },
    {
      name: "Priya Kapoor",
      phone: "+61 423 555 011",
      email: "priya.k@example.com",
      birthday: "1990-11-02",
      area: "Surry Hills",
      occupation: "Engineering lead",
      education: "USyd",
    },
    {
      name: "Jules Morrison",
      phone: "+61 434 555 012",
      email: "jules.m@example.com",
      area: "Balmain",
      occupation: "Founder",
      education: null,
    },
    {
      name: "Emma Walsh",
      phone: "+61 445 555 013",
      email: "emma.walsh@example.com",
      birthday: "1988-07-21",
      area: "Marrickville",
      occupation: "Teacher",
      education: "UTS",
    },
    {
      name: "Marco Rossi",
      phone: "+61 456 555 014",
      email: null,
      area: "Erskineville",
      occupation: "Chef",
      education: null,
    },
    {
      name: "Alex Kim",
      phone: "+61 467 555 015",
      email: "alex.kim@example.com",
      area: "Redfern",
      occupation: "Physiotherapist",
      education: null,
    },
  ];

  const { data: contacts, error: contactsErr } = await admin
    .from("contacts")
    .insert(contactRows.map((c) => ({ ...c, owner_id: ownerId })))
    .select("id, name");
  if (contactsErr) throw contactsErr;
  const byName = Object.fromEntries(contacts.map((c) => [c.name, c.id]));

  // --- Groups (group relationships auto-created) ---
  const { data: groups, error: groupsErr } = await admin
    .from("groups")
    .insert([
      { owner_id: ownerId, name: "College friends" },
      { owner_id: ownerId, name: "Family" },
    ])
    .select("id, name");
  if (groupsErr) throw groupsErr;
  const collegeGroup = groups.find((g) => g.name === "College friends").id;
  const familyGroup = groups.find((g) => g.name === "Family").id;

  await admin.from("contact_groups").insert([
    {
      owner_id: ownerId,
      group_id: collegeGroup,
      contact_id: byName["Sam Chen"],
    },
    {
      owner_id: ownerId,
      group_id: collegeGroup,
      contact_id: byName["Priya Kapoor"],
    },
    {
      owner_id: ownerId,
      group_id: collegeGroup,
      contact_id: byName["Jules Morrison"],
    },
    {
      owner_id: ownerId,
      group_id: familyGroup,
      contact_id: byName["Emma Walsh"],
    },
  ]);

  // --- Relationships: fetch + set role/cadence ---
  const { data: relationships, error: relErr } = await admin
    .from("relationships")
    .select("id, target_type, target_contact_id, target_group_id")
    .eq("owner_id", ownerId);
  if (relErr) throw relErr;

  const relForContact = (name) =>
    relationships.find(
      (r) =>
        r.target_type === "contact" &&
        r.target_contact_id === byName[name],
    )?.id;

  const relForGroup = (name) =>
    relationships.find(
      (r) =>
        r.target_type === "group" &&
        r.target_group_id ===
          groups.find((g) => g.name === name)?.id,
    )?.id;

  const roleCadence = [
    { id: relForContact("Sam Chen"), role: "close friend", cadence: "every few weeks" },
    { id: relForContact("Priya Kapoor"), role: "colleague", cadence: "monthly" },
    { id: relForContact("Jules Morrison"), role: "mentor", cadence: "quarterly" },
    { id: relForContact("Emma Walsh"), role: "sister", cadence: "weekly" },
    { id: relForContact("Marco Rossi"), role: "neighbour", cadence: "occasionally" },
    { id: relForContact("Alex Kim"), role: "gym friend", cadence: "weekly" },
    { id: relForGroup("College friends"), role: "old crew", cadence: "every few months" },
    { id: relForGroup("Family"), role: "family", cadence: "ongoing" },
  ].filter((r) => r.id);

  for (const row of roleCadence) {
    const { error } = await admin
      .from("relationships")
      .update({ role: row.role, cadence: row.cadence })
      .eq("id", row.id);
    if (error) throw error;
  }

  // --- Interactions (via RPC — one transaction, satisfies deferred FK) ---
  async function addInteraction({
    time,
    kind,
    notes,
    status,
    contactIds,
    groupId = null,
  }) {
    const { data, error } = await userClient.rpc("create_interaction", {
      p_time: time,
      p_kind: kind,
      p_notes: notes,
      p_status: status,
      p_contact_ids: contactIds,
      p_group_id: groupId,
    });
    if (error) throw error;
    return data;
  }

  await addInteraction({
    time: daysAgo(14),
    kind: "coffee",
    notes: "Caught up on work and life — Sam thinking about a career pivot.",
    status: "occurred",
    contactIds: [byName["Sam Chen"]],
  });
  await addInteraction({
    time: daysAgo(7),
    kind: "dinner",
    notes: "Priya's team shipped the release; celebrated briefly.",
    status: "occurred",
    contactIds: [byName["Priya Kapoor"]],
  });
  await addInteraction({
    time: daysAgo(3),
    kind: "call",
    notes: "Quick check-in with Emma about Mum's birthday plans.",
    status: "occurred",
    contactIds: [byName["Emma Walsh"]],
  });
  await addInteraction({
    time: daysFromNow(2).start,
    kind: "coffee",
    notes: "Follow up on the pivot conversation.",
    status: "planned",
    contactIds: [byName["Sam Chen"]],
  });
  await addInteraction({
    time: daysFromNow(5).start,
    kind: "catch-up",
    notes: "College friends reunion — need to confirm venue.",
    status: "planned",
    contactIds: [],
    groupId: collegeGroup,
  });
  await addInteraction({
    time: daysAgo(21),
    kind: "text",
    notes: "Meant to reply about the dinner invite.",
    status: "missed",
    contactIds: [byName["Jules Morrison"]],
  });

  // --- Open threads (via RPC for atomic link insert) ---
  async function addOpenThread({
    description,
    direction,
    relationshipIds,
    origin = null,
    communication_status = "not_communicated",
    closedAt = null,
  }) {
    const { data: threadId, error: tErr } = await userClient.rpc(
      "create_open_thread",
      {
        p_description: description,
        p_direction: direction,
        p_relationship_ids: relationshipIds,
      },
    );
    if (tErr) throw tErr;

    if (origin || communication_status !== "not_communicated" || closedAt) {
      const patch = {};
      if (origin) patch.origin = origin;
      if (communication_status)
        patch.communication_status = communication_status;
      if (closedAt) patch.closed_at = closedAt;
      const { error: upErr } = await admin
        .from("open_threads")
        .update(patch)
        .eq("id", threadId)
        .eq("owner_id", ownerId);
      if (upErr) throw upErr;
    }
    return threadId;
  }

  await addOpenThread({
    description: "Send Sam the intros he asked for",
    direction: "me_owes_them",
    relationshipIds: [relForContact("Sam Chen")],
    origin: "asked_of_me",
    communication_status: "confirmed",
  });
  await addOpenThread({
    description: "Book venue for college friends catch-up",
    direction: "me_owes_them",
    relationshipIds: [relForGroup("College friends")],
    origin: "self_led",
    communication_status: "not_communicated",
  });
  await addOpenThread({
    description: "Jules asked for feedback on his pitch deck",
    direction: "they_owe_me",
    relationshipIds: [relForContact("Jules Morrison")],
    communication_status: "confirmed",
  });
  await addOpenThread({
    description: "Organise Emma's birthday dinner",
    direction: "me_owes_them",
    relationshipIds: [relForContact("Emma Walsh")],
    origin: "self_led",
    communication_status: "confirmed",
    closedAt: daysAgo(2),
  });

  // --- User context ---
  await admin.from("goals_and_values").insert([
    {
      owner_id: ownerId,
      content: "Be more present with close friends and family.",
    },
    {
      owner_id: ownerId,
      content: "Keep professional network warm without it feeling transactional.",
    },
    {
      owner_id: ownerId,
      content: "Protect mornings for deep work — fewer reactive evenings.",
    },
  ]);

  await admin.from("situational_state").insert({
    owner_id: ownerId,
    content:
      "Settling into a new rhythm after a busy quarter. Social energy is medium — happy to connect but need lead time for bigger plans.",
  });

  await admin.from("transient_intent").insert([
    {
      owner_id: ownerId,
      session_id: "seed-session-past",
      relationship_id: relForContact("Sam Chen"),
      content: "Want to be intentional about supporting Sam through his pivot.",
      captured_at: daysAgo(5),
      expires_at: daysAgo(4),
    },
    {
      owner_id: ownerId,
      session_id: "seed-session-active",
      relationship_id: null,
      content: "Thinking about hosting a small dinner for college friends next month.",
      captured_at: daysAgo(1),
      expires_at: daysFromNow(6).start,
    },
  ]);

  // --- Inferred signals ---
  const cal1 = daysFromNow(1, 9, 0.5);
  const cal2 = daysFromNow(3, 14, 1);
  const cal3 = daysFromNow(0, 0, 0);
  await admin.from("inferred_signal_calendar").insert([
    {
      owner_id: ownerId,
      event_id: "seed-cal-1",
      title: "Team standup",
      start: cal1.start,
      end: cal1.end,
      is_all_day: false,
    },
    {
      owner_id: ownerId,
      event_id: "seed-cal-2",
      title: "Dentist",
      start: cal2.start,
      end: cal2.end,
      is_all_day: false,
    },
    {
      owner_id: ownerId,
      event_id: "seed-cal-3",
      title: "Focus block",
      start: cal3.start,
      end: new Date(
        new Date(cal3.start).getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
      is_all_day: true,
    },
  ]);

  await admin.from("inferred_signal_sleep").insert([
    {
      owner_id: ownerId,
      record_id: "seed-sleep-1",
      started_at: daysAgo(2, 23),
      ended_at: daysAgo(1, 7),
      duration_minutes: 470,
      quality: "good",
    },
    {
      owner_id: ownerId,
      record_id: "seed-sleep-2",
      started_at: daysAgo(1, 23),
      ended_at: daysAgo(0, 6),
      duration_minutes: 420,
      quality: "fair",
    },
    {
      owner_id: ownerId,
      record_id: "seed-sleep-3",
      started_at: daysAgo(0, 23),
      ended_at: daysFromNow(0, 6).start,
      duration_minutes: 450,
      quality: "good",
    },
  ]);

  // --- Candidate sets (Sam + College friends) ---
  async function addCandidateSet(relationshipId, mode, actions) {
    const { data: set, error: setErr } = await admin
      .from("candidate_sets")
      .insert({ owner_id: ownerId, relationship_id: relationshipId, mode })
      .select("id")
      .single();
    if (setErr) throw setErr;
    const { error: actErr } = await admin.from("candidate_actions").insert(
      actions.map((a) => ({
        owner_id: ownerId,
        candidate_set_id: set.id,
        type: a.type,
        payload: a.payload ?? null,
        why: a.why ?? null,
        decision_state: a.decision_state ?? "pending",
        decided_at: a.decided_at ?? null,
      })),
    );
    if (actErr) throw actErr;
    return set.id;
  }

  await addCandidateSet(relForContact("Sam Chen"), "triggered", [
    {
      type: "ScheduleInteraction",
      payload: {
        time: daysFromNow(2).start,
        kind: "coffee",
        notes: "Follow up on career pivot",
        contactIds: [byName["Sam Chen"]],
      },
      why: "You planned a coffee but haven't locked a time.",
    },
    {
      type: "OpenThread",
      payload: {
        description: "Share the two intros Sam asked for",
        direction: "me_owes_them",
        relationshipIds: [relForContact("Sam Chen")],
      },
      why: "Open commitment still outstanding.",
    },
    {
      type: "DoNothing",
      payload: {},
      why: "No urgent action on cadence otherwise.",
      decision_state: "ignored",
      decided_at: daysAgo(1),
    },
  ]);

  await addCandidateSet(relForGroup("College friends"), "baseline", [
    {
      type: "ScheduleInteraction",
      payload: {
        time: daysFromNow(5).start,
        kind: "catch-up",
        groupId: collegeGroup,
        notes: "Reunion — confirm venue with Priya",
      },
      why: "Group catch-up is on the calendar as planned.",
    },
  ]);

  // --- Chats ---
  const { data: closedChat, error: closedChatErr } = await admin
    .from("chats")
    .insert({
      owner_id: ownerId,
      title: "Weekend plans",
      closed_at: daysAgo(3),
      extracted_at: daysAgo(3),
    })
    .select("id")
    .single();
  if (closedChatErr) throw closedChatErr;

  const { data: openChat, error: openChatErr } = await admin
    .from("chats")
    .insert({ owner_id: ownerId, title: "Checking in with myself" })
    .select("id")
    .single();
  if (openChatErr) throw openChatErr;

  await admin.from("chat_messages").insert([
    {
      chat_id: closedChat.id,
      owner_id: ownerId,
      role: "user",
      content:
        "I keep saying yes to evening things and then regretting it the next morning.",
    },
    {
      chat_id: closedChat.id,
      owner_id: ownerId,
      role: "assistant",
      content:
        "That pattern shows up in your calendar too — three evening blocks this week. Want to name what you're optimising for right now?",
    },
    {
      chat_id: openChat.id,
      owner_id: ownerId,
      role: "user",
      content: "Who should I reach out to this week?",
    },
    {
      chat_id: openChat.id,
      owner_id: ownerId,
      role: "assistant",
      content:
        "Sam has a follow-up coffee planned and an open thread about intros. Emma's birthday thread is closed but you might still want a casual check-in.",
      tool_calls: [
        {
          id: "tu_seed_1",
          name: "list_relationships",
          input: {},
          result_preview: '[{"name":"Sam Chen"}]',
        },
      ],
    },
  ]);

  // --- Onboarding + notifications ---
  await admin.from("onboarding_state").upsert(
    {
      owner_id: ownerId,
      completed_steps: ["auth", "calendar", "healthkit", "contacts"],
      finished_at: daysAgo(30),
      updated_at: now,
    },
    { onConflict: "owner_id" },
  );

  await admin.from("notification_preferences").upsert(
    {
      owner_id: ownerId,
      enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
    { onConflict: "owner_id" },
  );

  return {
    contacts: contacts.length,
    groups: groups.length,
    relationships: relationships.length,
    chats: 2,
  };
}

async function main() {
  console.log(`Looking up ${EMAIL}…`);
  const user = await findUser();
  console.log(`User ${user.id}`);

  console.log("Clearing existing data…");
  await clearUserData(user.id);

  if (CLEAR_ONLY) {
    console.log("SEED_CLEAR_ONLY=1 — done.");
    return;
  }

  console.log("Minting user session for RPCs…");
  const userClient = await asUser(EMAIL);

  console.log("Seeding…");
  const summary = await seed(user.id, userClient);
  console.log("Seed complete:", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
