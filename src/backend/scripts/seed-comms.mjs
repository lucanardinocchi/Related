/**
 * Seed comms (iMessage, WhatsApp, TikTok, email, Instagram, X) for demo User.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/seed-comms.mjs
 *
 * Optional: SEED_EMAIL=other@example.com
 *
 * Requires contacts from seed-user.mjs (Sam Chen, Emma Walsh, etc.).
 * Clears only comms tables — does not wipe relationships or interactions.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const EMAIL = process.env.SEED_EMAIL ?? "lucanardinocchi@gmail.com";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function minutesAgo(n) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function hoursAgo(n) {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

function daysAgo(n, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** @param {Array<{ dir: 'inbound'|'outbound'|'sent'|'received', body: string, at: string, service?: string }>} turns */
function imessageTurns(turns) {
  return turns.map((t, i) => ({
    direction: t.dir === "outbound" || t.dir === "sent" ? "outbound" : "inbound",
    body: t.body,
    sent_at: t.at,
    service: t.service ?? "iMessage",
    external_message_id: `seed-imsg-${i}-${randomUUID().slice(0, 8)}`,
  }));
}

/** @param {Array<{ dir: 'inbound'|'outbound'|'sent'|'received', body: string, at: string }>} turns */
function whatsappTurns(turns) {
  return turns.map((t, i) => ({
    direction:
      t.dir === "outbound" || t.dir === "sent" ? "outbound" : "inbound",
    text: t.body,
    sent_at: t.at,
    wa_message_id: `seed-wa-${i}-${randomUUID().slice(0, 8)}`,
    from_phone: t.dir === "inbound" || t.dir === "received" ? "61412555010" : null,
    from_name: null,
  }));
}

/** @param {Array<{ dir: 'inbound'|'outbound'|'sent'|'received', body: string, at: string, from?: string }>} turns */
function tiktokTurns(turns, fromUsername) {
  return turns.map((t, i) => ({
    direction:
      t.dir === "outbound" || t.dir === "sent" ? "outbound" : "inbound",
    text: t.body,
    sent_at: t.at,
    tiktok_message_id: `seed-tt-${i}-${randomUUID().slice(0, 8)}`,
    from_username:
      t.dir === "inbound" || t.dir === "received" ? fromUsername : null,
  }));
}

/** @param {Array<{ dir: 'sent'|'received', subject: string, snippet: string, body: string, at: string }>} turns */
function emailTurns(turns) {
  return turns.map((t, i) => ({
    platform: "email",
    direction: t.dir,
    subject: t.subject,
    snippet: t.snippet,
    body: t.body,
    sent_at: t.at,
    external_id: `seed-email-${i}-${randomUUID().slice(0, 8)}`,
  }));
}

/** @param {Array<{ dir: 'sent'|'received', body: string, at: string }>} turns */
function instagramTurns(turns) {
  return turns.map((t, i) => ({
    platform: "instagram",
    direction: t.dir,
    body: t.body,
    sent_at: t.at,
    external_id: `seed-ig-${i}-${randomUUID().slice(0, 8)}`,
  }));
}

/** @param {Array<{ dir: 'sent'|'received', body: string, at: string }>} turns */
function xTurns(turns) {
  return turns.map((t, i) => ({
    platform: "x",
    direction: t.dir,
    body: t.body,
    sent_at: t.at,
    external_id: `seed-x-${i}-${randomUUID().slice(0, 8)}`,
  }));
}

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

async function clearComms(ownerId) {
  const tables = [
    "messages",
    "message_threads",
    "outbound_queue",
    "whatsapp_messages",
    "tiktok_messages",
    "comms_platform_messages",
  ];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("owner_id", ownerId);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
}

async function upsertContactFields(ownerId, byName) {
  const patches = [
    {
      name: "Sam Chen",
      instagram_username: "samchen.design",
      instagram_scoped_id: "seed-ig-sam",
      x_username: "samchen",
      x_user_id: "seed-x-sam",
      whatsapp_wa_id: "61412555010",
      tiktok_username: "samchen",
      tiktok_open_id: "seed-tt-sam",
    },
    {
      name: "Emma Walsh",
      whatsapp_wa_id: "61445555013",
      instagram_username: "emma.walsh",
    },
    {
      name: "Priya Kapoor",
      x_username: "priyakapoor",
      x_user_id: "seed-x-priya",
    },
    {
      name: "Alex Kim",
      tiktok_username: "alexkim.pt",
      tiktok_open_id: "seed-tt-alex",
    },
    {
      name: "Jules Morrison",
      instagram_username: "julesm.founder",
      x_username: "julesm",
    },
  ];

  for (const patch of patches) {
    const id = byName[patch.name];
    if (!id) continue;
    const { name: _n, ...fields } = patch;
    const { error } = await admin
      .from("contacts")
      .update(fields)
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (error) throw error;
  }
}

async function seedThread(ownerId, contactId, externalChatId, messages) {
  const lastAt = messages[messages.length - 1]?.sent_at ?? new Date().toISOString();
  const { data: thread, error: threadErr } = await admin
    .from("message_threads")
    .insert({
      owner_id: ownerId,
      contact_id: contactId,
      external_chat_id: externalChatId,
      display_name: null,
      participant_handles: [],
      last_message_at: lastAt,
    })
    .select("id")
    .single();
  if (threadErr) throw threadErr;

  const { error: msgErr } = await admin.from("messages").insert(
    messages.map((m) => ({
      owner_id: ownerId,
      thread_id: thread.id,
      external_message_id: m.external_message_id,
      direction: m.direction,
      body: m.body,
      sent_at: m.sent_at,
      service: m.service,
    })),
  );
  if (msgErr) throw msgErr;
  return messages.length;
}

async function seedComms(ownerId, byName) {
  let total = 0;

  const sam = byName["Sam Chen"];
  const emma = byName["Emma Walsh"];
  const priya = byName["Priya Kapoor"];
  const alex = byName["Alex Kim"];
  const jules = byName["Jules Morrison"];

  if (!sam) {
    throw new Error(
      "Sam Chen contact not found — run seed-user.mjs first.",
    );
  }

  // --- Sam Chen: rich cross-platform history (career pivot arc) ---
  total += await seedThread(
    ownerId,
    sam,
    "seed-chat-sam-imessage",
    imessageTurns([
      { dir: "received", at: daysAgo(18, 19, 12), body: "ok serious question — would you ever leave product to go indie?" },
      { dir: "outbound", at: daysAgo(18, 19, 18), body: "Depends on the idea. Why, you thinking about it?" },
      { dir: "received", at: daysAgo(18, 20, 5), body: "Maybe. I'm exhausted by roadmap theatre." },
      { dir: "outbound", at: daysAgo(17, 8, 30), body: "Let's grab coffee this week and talk properly." },
      { dir: "received", at: daysAgo(17, 8, 45), body: "Yes please. Thursday?" },
      { dir: "outbound", at: daysAgo(17, 9, 2), body: "Thursday works — Single O at 8?" },
      { dir: "received", at: daysAgo(17, 9, 4), body: "Perfect" },
      { dir: "received", at: daysAgo(14, 21, 10), body: "That coffee helped. I'm going to take the weekend and draft a one-pager." },
      { dir: "outbound", at: daysAgo(14, 21, 35), body: "Love it. Send it when you're ready — happy to tear it apart gently." },
      { dir: "received", at: daysAgo(12, 10, 15), body: "Draft v1 attached in email. Be brutal." },
      { dir: "outbound", at: daysAgo(12, 11, 0), body: "Reading tonight. Also those two intros you asked for — I'll send tomorrow." },
      { dir: "received", at: daysAgo(10, 16, 20), body: "You're a legend. How's the feedback looking?" },
      { dir: "outbound", at: daysAgo(10, 17, 5), body: "Strong core, fuzzy GTM. Replied on email with notes." },
      { dir: "received", at: daysAgo(7, 12, 0), body: "Updated deck is in your inbox. closer?" },
      { dir: "outbound", at: daysAgo(7, 18, 30), body: "Much closer. Still want one more customer conversation before you jump." },
      { dir: "received", at: daysAgo(5, 9, 10), body: "Had two calls yesterday — feeling good." },
      { dir: "outbound", at: daysAgo(5, 9, 22), body: "Nice. Keep me posted on timing." },
      { dir: "received", at: daysAgo(3, 20, 15), body: "Thinking notice end of month. Scary." },
      { dir: "outbound", at: daysAgo(3, 20, 40), body: "Scary is fine. You've done the work." },
      { dir: "received", at: daysAgo(1, 7, 50), body: "Can we do a quick call today? 15 min" },
      { dir: "outbound", at: daysAgo(1, 8, 5), body: "11:30 works" },
      { dir: "received", at: hoursAgo(6), body: "Thanks for today. Feeling clearer." },
      { dir: "outbound", at: hoursAgo(5), body: "Anytime. Proud of you for doing this properly." },
      { dir: "received", at: minutesAgo(45), body: "One more thing — do you know anyone at Atlassian design ops?" },
    ]),
  );

  const samWhatsapp = whatsappTurns([
    { dir: "received", at: daysAgo(16, 12, 30), body: "running 5 late for coffee" },
    { dir: "outbound", at: daysAgo(16, 12, 32), body: "all good, grabbed a table out the back" },
    { dir: "received", at: daysAgo(13, 18, 0), body: "sent you a voice note on the deck — too long to type lol" },
    { dir: "outbound", at: daysAgo(13, 18, 20), body: "listening now" },
    { dir: "received", at: daysAgo(9, 8, 0), body: "intro from Marcus landed 🙏" },
    { dir: "outbound", at: daysAgo(9, 8, 12), body: "he's great — tell him I sent you" },
    { dir: "received", at: daysAgo(4, 13, 45), body: "venue rec for Emma's thing: maybe Nomad?" },
    { dir: "outbound", at: daysAgo(4, 14, 0), body: "Nomad works — I'll check capacity" },
    { dir: "received", at: daysAgo(2, 19, 30), body: "still on for Saturday run?" },
    { dir: "outbound", at: daysAgo(2, 19, 35), body: "yes — 7am Centennial if not raining" },
    { dir: "received", at: hoursAgo(20), body: "deck v3 in email when you get a sec" },
    { dir: "outbound", at: hoursAgo(18), body: "on it tonight" },
  ]);
  const { error: samWaErr } = await admin.from("whatsapp_messages").insert(
    samWhatsapp.map((m) => ({
      owner_id: ownerId,
      contact_id: sam,
      ...m,
    })),
  );
  if (samWaErr) throw samWaErr;
  total += samWhatsapp.length;

  const samTiktok = tiktokTurns(
    [
      { dir: "received", at: daysAgo(11, 22, 0), body: "this founder clip is literally us rn 😭" },
      { dir: "outbound", at: daysAgo(11, 22, 15), body: "painfully accurate" },
      { dir: "received", at: daysAgo(6, 21, 30), body: "ok but watch this pivot story — 2min" },
      { dir: "outbound", at: daysAgo(6, 21, 45), body: "saved — good pre-call prep" },
      { dir: "received", at: daysAgo(2, 23, 10), body: "sent you that restaurant reel" },
      { dir: "outbound", at: daysAgo(2, 23, 12), body: "bookmarked for Thursday" },
    ],
    "samchen",
  );
  const { error: samTtErr } = await admin.from("tiktok_messages").insert(
    samTiktok.map((m) => ({
      owner_id: ownerId,
      contact_id: sam,
      ...m,
    })),
  );
  if (samTtErr) throw samTtErr;
  total += samTiktok.length;

  const samPlatform = [
    ...emailTurns([
      {
        dir: "received",
        at: daysAgo(12, 22, 0),
        subject: "Pivot one-pager v1",
        snippet: "Ok be honest — is this too broad? I can feel myself hedging…",
        body:
          "Hey,\n\nOk be honest — is this too broad? I can feel myself hedging on the problem statement.\n\nThe idea: a lightweight CRM for solo consultants who live in email + DMs and hate Salesforce.\n\nThree things I'm unsure about:\n1. Whether \"solo consultant\" is too narrow for year one\n2. If the wedge should be follow-up reminders vs inbox sync\n3. Whether I'd need a co-founder for sales\n\nRip it apart.\n\n— Sam",
      },
      {
        dir: "sent",
        at: daysAgo(12, 23, 15),
        subject: "Re: Pivot one-pager v1",
        snippet: "Problem is clear. GTM is fuzzy — who pays first and why now?",
        body:
          "Sam,\n\nProblem is clear. GTM is fuzzy — who pays first and why now?\n\nI'd tighten to one persona (e.g. fractional CPOs) and one painful moment (dropping follow-ups after intro calls).\n\nThe co-founder question: not yet. Run 10 paid design partners first.\n\nHappy to review v2.\n",
      },
      {
        dir: "received",
        at: daysAgo(10, 9, 30),
        subject: "Intros — Marcus + Lin",
        snippet: "Thanks again. Marcus replied already. Lin is slower but I'll nudge.",
        body:
          "Both intros landed — really appreciate you making the time.\n\nMarcus wants to chat next week. Lin is slower but I'll nudge.\n\nWill send deck v2 tonight.",
      },
      {
        dir: "sent",
        at: daysAgo(7, 20, 0),
        subject: "Re: deck v2 — feedback",
        snippet: "Slide 4 is your best. Slide 7 reads like a feature list.",
        body:
          "Deck v2 is much tighter.\n\nSlide 4 (the \"moment of failure\" story) is your best — lead with that everywhere.\n\nSlide 7 still reads like a feature list. Reframe as outcomes: fewer dropped threads, faster replies, calmer inbox.\n\nOne customer quote on slide 2 would help if you can get it.",
      },
      {
        dir: "received",
        at: daysAgo(5, 14, 0),
        subject: "Notice timing",
        snippet: "Leaning end of month. HR conversation booked for Tuesday.",
        body:
          "Quick update — leaning end of month for notice.\n\nHR conversation booked for Tuesday. Manager still doesn't know.\n\nCan I send you the final deck before I submit?",
      },
      {
        dir: "sent",
        at: daysAgo(5, 16, 30),
        subject: "Re: Notice timing",
        snippet: "Yes send final deck. Tuesday HR is the right move.",
        body:
          "Yes — send final deck.\n\nTuesday HR is the right move. Keep manager conversation same day if you can.\n\nYou've got runway and signal. Don't let fear push you early or delay you into paralysis.",
      },
      {
        dir: "received",
        at: daysAgo(1, 11, 0),
        subject: "Atlassian design ops?",
        snippet: "Anyone come to mind for an informational chat?",
        body:
          "Last ask for the week — do you know anyone in design ops at Atlassian (or similar scale) who'd do a 20-min informational?\n\nTrying to sanity-check enterprise sales cycle assumptions.\n\nNo stress if not.",
      },
      {
        dir: "sent",
        at: hoursAgo(4),
        subject: "Re: Atlassian design ops?",
        snippet: "Yes — I'll intro you to Rina. She left Atlassian last year.",
        body:
          "Yes — I'll intro you to Rina. She left Atlassian design ops last year and knows that buying process cold.\n\nI'll email intro tonight.",
      },
    ]),
    ...instagramTurns([
      { dir: "received", at: daysAgo(15, 20, 0), body: "saw your story — that talk looked packed 👏" },
      { dir: "sent", at: daysAgo(15, 20, 12), body: "was fun! we should debrief" },
      { dir: "received", at: daysAgo(8, 19, 0), body: "sent you a reel on founder loneliness — too real" },
      { dir: "sent", at: daysAgo(8, 19, 30), body: "watching now 😅" },
      { dir: "received", at: daysAgo(3, 12, 0), body: "coffee pics making me hungry" },
      { dir: "sent", at: daysAgo(3, 12, 5), body: "Single O never misses" },
      { dir: "received", at: hoursAgo(10), body: "good luck with the HR chat tmrw 🤞" },
    ]),
    ...xTurns([
      { dir: "received", at: daysAgo(14, 15, 0), body: "this thread on indie SaaS margins is worth a read" },
      { dir: "sent", at: daysAgo(14, 15, 20), body: "saved — thx" },
      { dir: "received", at: daysAgo(6, 9, 0), body: "lol @ the roadmap meme you posted" },
      { dir: "sent", at: daysAgo(6, 9, 5), body: "painfully on brand for my week" },
      { dir: "received", at: daysAgo(1, 16, 0), body: "lmk how HR goes" },
    ]),
  ];
  const { error: samPlatErr } = await admin.from("comms_platform_messages").insert(
    samPlatform.map((m) => ({
      owner_id: ownerId,
      contact_id: sam,
      ...m,
    })),
  );
  if (samPlatErr) throw samPlatErr;
  total += samPlatform.length;

  // --- Emma Walsh: family + birthday planning ---
  if (emma) {
    total += await seedThread(
      ownerId,
      emma,
      "seed-chat-emma-imessage",
      imessageTurns([
        { dir: "received", at: daysAgo(10, 9, 0), body: "Mum's birthday — thinking Sat 14th?" },
        { dir: "outbound", at: daysAgo(10, 9, 15), body: "14th works. I'll look at restaurants" },
        { dir: "received", at: daysAgo(9, 18, 0), body: "She said no loud places 🙄" },
        { dir: "outbound", at: daysAgo(9, 18, 20), body: "Noted. Quiet-ish but nice — I'll shortlist" },
        { dir: "received", at: daysAgo(6, 12, 0), body: "Can you call Dad about the cake?" },
        { dir: "outbound", at: daysAgo(6, 12, 30), body: "Yep will call tonight" },
        { dir: "received", at: daysAgo(4, 8, 0), body: "Nomad or Berta — Mum prefers Berta I think" },
        { dir: "outbound", at: daysAgo(4, 8, 10), body: "Berta it is — checking availability" },
        { dir: "received", at: daysAgo(2, 19, 0), body: "Thanks for organising. Means a lot." },
        { dir: "outbound", at: daysAgo(2, 19, 5), body: "Of course ❤️" },
        { dir: "received", at: hoursAgo(12), body: "Can you pick up flowers on the day?" },
        { dir: "outbound", at: hoursAgo(11), body: "Already on my list" },
      ]),
    );

    const emmaWa = whatsappTurns([
      { dir: "received", at: daysAgo(8, 14, 0), body: "photo of Mum's gift idea — too much?" },
      { dir: "outbound", at: daysAgo(8, 14, 10), body: "perfect actually" },
      { dir: "received", at: daysAgo(3, 10, 0), body: "guest list in notes app — lmk if I missed anyone" },
      { dir: "outbound", at: daysAgo(3, 10, 20), body: "looks complete to me" },
    ]);
    await admin.from("whatsapp_messages").insert(
      emmaWa.map((m) => ({ owner_id: ownerId, contact_id: emma, ...m })),
    );
    total += emmaWa.length;
  }

  // --- Priya Kapoor: work + social ---
  if (priya) {
    total += await seedThread(
      ownerId,
      priya,
      "seed-chat-priya-imessage",
      imessageTurns([
        { dir: "received", at: daysAgo(9, 17, 0), body: "Ship party Thursday — you in?" },
        { dir: "outbound", at: daysAgo(9, 17, 10), body: "Wouldn't miss it" },
        { dir: "received", at: daysAgo(5, 12, 0), body: "Release went smooth btw 🎉" },
        { dir: "outbound", at: daysAgo(5, 12, 15), body: "Huge — congrats to the team" },
        { dir: "received", at: daysAgo(2, 8, 30), body: "Coffee next week to catch up properly?" },
        { dir: "outbound", at: daysAgo(2, 9, 0), body: "Tues or Wed morning?" },
        { dir: "received", at: daysAgo(1, 10, 0), body: "Wed 8am?" },
        { dir: "outbound", at: daysAgo(1, 10, 5), body: "Locked" },
      ]),
    );

    const priyaPlatform = [
      ...emailTurns([
        {
          dir: "received",
          at: daysAgo(6, 16, 0),
          subject: "Release retro notes",
          snippet: "Sharing internally — feel free to add comments on doc…",
          body:
            "Hey,\n\nSharing our release retro notes internally — feel free to add comments if anything resonates from the outside.\n\nMain theme: we underestimated QA on mobile web.\n\n— Priya",
        },
        {
          dir: "sent",
          at: daysAgo(6, 18, 0),
          subject: "Re: Release retro notes",
          snippet: "Left two comments — the mobile web QA point is spot on.",
          body:
            "Left two comments on the doc.\n\nThe mobile web QA point is spot on — seen that pattern before.\n\nCongrats again on the ship.",
        },
      ]),
      ...xTurns([
        { dir: "received", at: daysAgo(7, 11, 0), body: "team nailed the launch thread" },
        { dir: "sent", at: daysAgo(7, 11, 10), body: "strong work" },
        { dir: "received", at: daysAgo(2, 14, 0), body: "this eng hiring take is good" },
      ]),
    ];
    await admin.from("comms_platform_messages").insert(
      priyaPlatform.map((m) => ({
        owner_id: ownerId,
        contact_id: priya,
        ...m,
      })),
    );
    total += priyaPlatform.length;
  }

  // --- Alex Kim: gym + casual ---
  if (alex) {
    total += await seedThread(
      ownerId,
      alex,
      "seed-chat-alex-imessage",
      imessageTurns([
        { dir: "received", at: daysAgo(5, 6, 30), body: "Leg day still on?" },
        { dir: "outbound", at: daysAgo(5, 6, 35), body: "Yep — 6:45" },
        { dir: "received", at: daysAgo(3, 6, 40), body: "Running 10 late" },
        { dir: "outbound", at: daysAgo(3, 6, 42), body: "np warming up" },
        { dir: "received", at: daysAgo(1, 18, 0), body: "shoulder felt better after those bands you showed me" },
        { dir: "outbound", at: daysAgo(1, 18, 10), body: "nice — keep doing them daily" },
      ]),
    );

    const alexTt = tiktokTurns(
      [
        { dir: "received", at: daysAgo(4, 20, 0), body: "mobility routine — try this before squats" },
        { dir: "outbound", at: daysAgo(4, 20, 15), body: "tried it — hips feel better already" },
        { dir: "received", at: daysAgo(1, 21, 0), body: "meal prep reel but make it realistic 😂" },
      ],
      "alexkim.pt",
    );
    await admin.from("tiktok_messages").insert(
      alexTt.map((m) => ({ owner_id: ownerId, contact_id: alex, ...m })),
    );
    total += alexTt.length;
  }

  // --- Jules Morrison: mentor sporadic ---
  if (jules) {
    total += await seedThread(
      ownerId,
      jules,
      "seed-chat-jules-imessage",
      imessageTurns([
        { dir: "received", at: daysAgo(20, 11, 0), body: "Pitch deck — still want eyes on it?" },
        { dir: "outbound", at: daysAgo(20, 14, 0), body: "Yes please — sending tonight" },
        { dir: "received", at: daysAgo(18, 9, 0), body: "Slide 3 loses me. Happy to jump on a call." },
        { dir: "outbound", at: daysAgo(18, 10, 0), body: "Friday arvo?" },
        { dir: "received", at: daysAgo(15, 15, 0), body: "Booked — calendar invite sent" },
      ]),
    );

    const julesPlatform = instagramTurns([
      { dir: "received", at: daysAgo(19, 10, 0), body: "saw you at the founder meetup — we should sync properly" },
      { dir: "sent", at: daysAgo(19, 11, 0), body: "agreed — scheduling follow-up" },
      { dir: "received", at: daysAgo(11, 16, 0), body: "this VC post is cynical but not wrong" },
    ]);
    await admin.from("comms_platform_messages").insert(
      julesPlatform.map((m) => ({
        owner_id: ownerId,
        contact_id: jules,
        ...m,
      })),
    );
    total += julesPlatform.length;
  }

  return total;
}

async function main() {
  console.log(`Looking up ${EMAIL}…`);
  const user = await findUser();
  console.log(`User ${user.id}`);

  const { data: contacts, error: contactsErr } = await admin
    .from("contacts")
    .select("id, name")
    .eq("owner_id", user.id);
  if (contactsErr) throw contactsErr;
  if (!contacts?.length) {
    throw new Error("No contacts found — run seed-user.mjs first.");
  }

  const byName = Object.fromEntries(contacts.map((c) => [c.name, c.id]));
  console.log(`Found ${contacts.length} contacts`);

  console.log("Clearing existing comms…");
  await clearComms(user.id);

  console.log("Updating contact social handles…");
  await upsertContactFields(user.id, byName);

  console.log("Seeding comms…");
  const total = await seedComms(user.id, byName);
  console.log(`Done — ${total} messages across all platforms.`);
  console.log("Open Sam Chen's relationship page for the fullest timeline.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
