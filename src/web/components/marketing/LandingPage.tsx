"use client";

import {
  Calendar,
  CheckCircle2,
  HeartHandshake,
  MessageSquareText,
  Mic,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Body, Eyebrow, H2, Mono, Small } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { MarketingLinkButton } from "./MarketingLinkButton";

const POCKET_URL = "https://heypocket.com";

const RELATIONSHIP_CARDS = [
  {
    name: "Maya Chen",
    context: "Last coffee · 6 weeks ago",
    action: "Schedule a catch-up before her move",
    tone: "review" as const,
  },
  {
    name: "James & Priya",
    context: "Open thread · intro to investor",
    action: "Send the follow-up you promised",
    tone: "sent" as const,
  },
  {
    name: "Tom Walsh",
    context: "Birthday in 12 days",
    action: "Draft a message that sounds like you",
    tone: "approved" as const,
  },
  {
    name: "Design crew",
    context: "Group · quarterly check-in",
    action: "Propose a dinner in the next two weeks",
    tone: "draft" as const,
  },
  {
    name: "Elena Rossi",
    context: "New role · congratulations overdue",
    action: "Reach out with a short note",
    tone: "review" as const,
  },
  {
    name: "College friends",
    context: "Group · reunion thread open",
    action: "Suggest dates that fit your calendar",
    tone: "sent" as const,
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect your world",
    body: "Link calendars, email, and messaging. Related reads context. It never posts on your behalf.",
  },
  {
    step: "02",
    title: "Ambient passes run",
    body: "Background intelligence reviews each relationship and surfaces structured Candidate Actions.",
  },
  {
    step: "03",
    title: "Review proposals",
    body: "Accept, edit, or decline every suggestion. The agent never auto-executes.",
  },
  {
    step: "04",
    title: "Stay in rhythm",
    body: "Commitments, calendar density, and open threads keep you close without the mental load.",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "Ambient Intelligence",
    body: "Continuous background passes per relationship, with timing, tone, and context included.",
  },
  {
    icon: CheckCircle2,
    title: "Commitments",
    body: "See what you owe people in one place. Nothing slips because you forgot a thread.",
  },
  {
    icon: Calendar,
    title: "Unified calendar",
    body: "Manual events plus Google and Outlook sync. Density-aware catch-up suggestions.",
  },
  {
    icon: MessageSquareText,
    title: "Agent chat",
    body: "Think out loud with your data. Conversational intelligence, read-only and grounded.",
  },
  {
    icon: HeartHandshake,
    title: "Values Discovery",
    body: "Swipe and rank characters to surface what you care about. Proposed Goals and Values save only after you confirm.",
  },
  {
    icon: Users,
    title: "Relationships & groups",
    body: "Contacts and groups share one model with history, comms, and candidate actions together.",
  },
];

const INTEGRATIONS = [
  "Google Calendar",
  "Outlook",
  "Gmail",
  "Instagram",
  "X",
  "Pocket AI",
  "HealthKit (iOS)",
  "MCP for Claude & Cursor",
];

const POCKET_EXTRACTS = [
  "Note: Moving to London in March, wants intro to design leads",
  "Open thread: Send portfolio to her team",
  "Interaction: Coffee catch-up logged on the timeline",
];

const PERSONAS = [
  {
    label: "Founders",
    quote:
      "I stopped losing track of intros and follow-ups. Related remembers the social graph I can't.",
  },
  {
    label: "Operators",
    quote:
      "My week is packed. Candidate Actions tell me who needs attention before it becomes awkward.",
  },
  {
    label: "Connectors",
    quote:
      "Groups, birthdays, open threads. Finally one place that respects how relationships actually work.",
  },
];

function RelationshipCard({
  name,
  context,
  action,
  tone,
}: (typeof RELATIONSHIP_CARDS)[number]) {
  return (
    <Card className="w-[280px] shrink-0 p-4 shadow-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-medium text-fg">{name}</div>
          <Small as="p" className="mt-0.5">
            {context}
          </Small>
        </div>
        <Badge tone={tone}>Action</Badge>
      </div>
      <p className="mt-3 text-[13px] leading-[20px] text-fg-muted">{action}</p>
    </Card>
  );
}

function MarqueeRow({
  items,
  reverse = false,
}: {
  items: typeof RELATIONSHIP_CARDS;
  reverse?: boolean;
}) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          "flex w-max gap-4 py-2",
          reverse ? "animate-marquee-reverse" : "animate-marquee",
        )}
      >
        {doubled.map((item, i) => (
          <RelationshipCard key={`${item.name}-${i}`} {...item} />
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <>
      {/* Announcement */}
      <div className="border-b border-border bg-accent-subtle/60">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 py-2.5">
          <Badge tone="info">New</Badge>
          <Small className="text-fg">
            Ambient Intelligence runs in the background. You stay in control of
            every action.
          </Small>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--color-accent-subtle),transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pb-24 sm:pt-20">
          <Eyebrow className="text-center">Ambient relationship intelligence</Eyebrow>
          <h1 className="mx-auto mt-4 max-w-3xl text-center text-[40px] font-medium leading-[1.1] tracking-[-0.03em] text-fg sm:text-[56px]">
            Stay close to the people you care about
          </h1>
          <Body className="mx-auto mt-5 max-w-xl text-center text-[16px] leading-[26px] text-fg-muted">
            Related runs in the background against every relationship, surfacing
            Candidate Actions you can accept, edit, or decline. Never a CRM. Never
            auto-sent.
          </Body>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <MarketingLinkButton href="/sign-up" size="lg">
              Start 7-day free trial
            </MarketingLinkButton>
            <MarketingLinkButton href="#how-it-works" variant="secondary" size="lg">
              See how it works
            </MarketingLinkButton>
          </div>

          <div className="mt-12 flex flex-col items-center gap-3">
            <div className="flex -space-x-2">
              {["SC", "JR", "AM", "KL", "DP"].map((initials) => (
                <div
                  key={initials}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg bg-surface-2 text-[10px] font-medium text-fg-muted"
                >
                  {initials}
                </div>
              ))}
            </div>
            <Small>For founders, operators, and anyone who hates letting friendships go cold</Small>
          </div>
        </div>
      </section>

      {/* Spotlight */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <Eyebrow>Spotlight</Eyebrow>
            <h2 className="mt-2 text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg sm:text-[32px]">
              One missed follow-up can cost a relationship
            </h2>
            <Body className="mt-4 text-fg-muted">
              Related noticed an open thread with a friend you promised to intro.
              It drafted a Candidate Action with the right tone and timing. You
              edited two words and sent it.
            </Body>
            <MarketingLinkButton href="/sign-up" className="mt-6">
              Start completely free
            </MarketingLinkButton>
          </div>

          <Card className="border border-border bg-bg p-5 shadow-2">
            <div className="flex items-center justify-between">
              <div>
                <Small className="uppercase tracking-[0.08em]">Candidate Action</Small>
                <div className="mt-1 text-[15px] font-medium">Send follow-up</div>
              </div>
              <Badge tone="review">Pending</Badge>
            </div>
            <p className="mt-3 text-[13px] leading-[20px] text-fg-muted">
              You told James you&apos;d connect him with Priya after your last
              coffee. It&apos;s been 11 days. A short note keeps the thread warm.
            </p>
            <div className="mt-4 rounded-md bg-surface p-3">
              <Small className="block text-fg-subtle">Suggested message</Small>
              <p className="mt-1 text-[13px] leading-[20px] text-fg">
                Hey James, finally putting you in touch with Priya. She&apos;s
                exactly the person you wanted to meet for the seed round convo.
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <span className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-fg text-[13px] font-medium text-fg-on-accent">
                Accept & send
              </span>
              <span className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-surface text-[13px] font-medium text-fg">
                Edit
              </span>
            </div>
          </Card>
        </div>
      </section>

      {/* Pivot */}
      <section className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
        <Eyebrow>Do it with Related</Eyebrow>
        <h2 className="mx-auto mt-2 max-w-2xl text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg sm:text-[36px]">
          Stop putting off the people who matter
        </h2>
        <Body className="mx-auto mt-4 max-w-lg text-fg-muted">
          The fastest way to maintain real relationships with ambient intelligence
          that reads your calendar, comms, and context, then proposes what to do
          next.
        </Body>
      </section>

      {/* Ambient Intelligence highlight */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_340px] lg:items-start">
          <div>
            <Badge tone="info" className="mb-4">
              Core product
            </Badge>
            <h2 className="text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg sm:text-[32px]">
              Ambient Intelligence for every relationship
            </h2>
            <Body className="mt-4 max-w-lg text-fg-muted">
              Background agent passes run continuously. Each surfaces structured
              Candidate Actions: schedule a catch-up, close an open thread, send
              a message. You decide. Related never executes on its own.
            </Body>
            <ul className="mt-6 space-y-2.5">
              {[
                "Per-relationship context and history",
                "Calendar-density-aware timing",
                "Accept, edit, or decline every proposal",
                "Conversational agent for thinking out loud",
                "Values and goals inform suggestions",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[14px] text-fg">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0 text-success"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div id="pricing" className="lg:sticky lg:top-20">
          <Card
            className="border border-border bg-bg p-6 shadow-2"
          >
            <Eyebrow>Related Pro</Eyebrow>
            <div className="mt-2 flex items-baseline gap-1">
              <Mono className="text-[36px] leading-none">$29</Mono>
              <Small>/ month</Small>
            </div>
            <Small as="p" className="mt-2">
              7-day free trial · cancel anytime
            </Small>
            <MarketingLinkButton href="/sign-up" className="mt-6 w-full" size="lg">
              Start free trial
            </MarketingLinkButton>
            <ul className="mt-6 space-y-2 border-t border-border pt-6">
              {[
                "Ambient Intelligence background passes",
                "Unlimited relationships & groups",
                "Calendar, email & messaging integrations",
                "Agent chat & commitment tracking",
              ].map((item) => (
                <li key={item} className="text-[13px] text-fg-muted">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          </div>
        </div>
      </section>

      {/* Gallery marquee */}
      <section className="overflow-hidden py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>See what Related surfaces</Eyebrow>
          <h2 className="mt-2 text-[24px] font-medium tracking-[-0.01em] text-fg sm:text-[28px]">
            Candidate Actions across your relationships
          </h2>
          <Small as="p" className="mt-2">
            All proposed by Ambient Intelligence. You stay in control.
          </Small>
        </div>
        <div className="mt-10 space-y-4">
          <MarqueeRow items={RELATIONSHIP_CARDS} />
          <MarqueeRow items={[...RELATIONSHIP_CARDS].reverse()} reverse />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-2 text-[28px] font-medium tracking-[-0.02em] text-fg">
              Four steps to staying close
            </h2>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step}>
                <Mono className="text-[13px] text-accent">{item.step}</Mono>
                <H2 className="mt-2 text-[16px]">{item.title}</H2>
                <Small as="p" className="mt-2">
                  {item.body}
                </Small>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <MarketingLinkButton href="/sign-up">Get started for free</MarketingLinkButton>
          </div>
        </div>
      </section>

      {/* Pocket */}
      <section id="pocket" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Card className="order-2 border border-border bg-bg p-5 shadow-2 lg:order-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface">
                <Mic size={16} className="text-fg-muted" aria-hidden />
              </div>
              <div>
                <Small className="uppercase tracking-[0.08em]">Pocket recording</Small>
                <div className="text-[15px] font-medium">Coffee with Maya Chen</div>
              </div>
              <Badge tone="sent" className="ml-auto">
                Imported
              </Badge>
            </div>
            <p className="mt-3 text-[13px] leading-[20px] text-fg-muted">
              42 min · transcribed automatically after the conversation ended
            </p>

            <div className="my-4 flex items-center gap-2 text-[12px] text-fg-subtle">
              <span className="h-px flex-1 bg-border" />
              Extraction Pass
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Small className="block text-fg-subtle">Added to Maya Chen</Small>
              {POCKET_EXTRACTS.map((item) => (
                <div
                  key={item}
                  className="rounded-md bg-surface px-3 py-2 text-[13px] leading-[20px] text-fg"
                >
                  {item}
                </div>
              ))}
            </div>
          </Card>

          <div className="order-1 lg:order-2">
            <Eyebrow>Pocket integration</Eyebrow>
            <h2 className="mt-2 text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg sm:text-[32px]">
              Surface the context that usually gets lost
            </h2>
            <Body className="mt-4 text-fg-muted">
              Link Related to{" "}
              <a
                href={POCKET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Pocket
              </a>
              . Record coffees, calls, and meetings in the real world. Transcripts
              import automatically, run through the Extraction Pass, and land on
              the right relationship as notes, interactions, and open threads.
            </Body>
            <ul className="mt-6 space-y-2.5">
              {[
                "Automatic import when Pocket finishes transcription",
                "Speaker matching ties the conversation to the right contact",
                "Commitments and follow-ups extracted from what you actually said",
                "Ambient Intelligence uses the new context on the next pass",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[14px] text-fg">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0 text-success"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={POCKET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-md bg-fg px-4 text-[14px] font-medium text-fg-on-accent transition-colors hover:bg-[#1f1d18]"
              >
                Get Pocket
              </a>
              <MarketingLinkButton href="/sign-up" variant="secondary">
                Connect in Related
              </MarketingLinkButton>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="text-center">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-2 text-[28px] font-medium tracking-[-0.02em] text-fg">
            Relationship intelligence, not another inbox
          </h2>
          <Body className="mx-auto mt-3 max-w-lg text-fg-muted">
            Built for individuals who care about people, not sales pipelines or
            team CRMs.
          </Body>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="border border-border bg-bg p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-subtle text-accent">
                <Icon size={18} aria-hidden />
              </div>
              <H2 className="mt-4 text-[16px]">{title}</H2>
              <Small as="p" className="mt-2">
                {body}
              </Small>
            </Card>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <Eyebrow>Integrations</Eyebrow>
              <h2 className="mt-2 text-[28px] font-medium tracking-[-0.02em] text-fg">
                Connect the channels you already use
              </h2>
              <Body className="mt-4 text-fg-muted">
                Read-only calendar access, email and DMs on relationship pages,
                Pocket voice recordings, HealthKit sleep on iOS, and MCP for Claude
                and Cursor. Connect what you use. Skip the rest.
              </Body>
              <MarketingLinkButton href="/sign-up" className="mt-6">
                Connect your accounts
              </MarketingLinkButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTEGRATIONS.map((name) => (
                <span
                  key={name}
                  className="rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Personas */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="text-center">
          <Eyebrow>Built for</Eyebrow>
          <h2 className="mt-2 text-[28px] font-medium tracking-[-0.02em] text-fg">
            People who take relationships seriously
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PERSONAS.map(({ label, quote }) => (
            <Card key={label} className="border border-border bg-bg p-5">
              <Badge tone="neutral">{label}</Badge>
              <p className="mt-4 text-[15px] leading-[24px] text-fg">&ldquo;{quote}&rdquo;</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing repeat */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-2 text-[28px] font-medium tracking-[-0.02em] text-fg">
            One plan. Everything included.
          </h2>
          <Body className="mx-auto mt-3 max-w-md text-fg-muted">
            Related Pro at $29/month with a 7-day free trial. Ambient
            Intelligence, integrations, and unlimited relationships.
          </Body>
          <MarketingLinkButton href="/sign-up" size="lg" className="mt-8">
            Start your free trial
          </MarketingLinkButton>
          <Small as="p" className="mt-4">
            No credit card required to explore · Cancel anytime
          </Small>
        </div>
      </section>
    </>
  );
}
