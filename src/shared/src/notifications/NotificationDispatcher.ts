/**
 * Notification dispatcher per Slice 15. Invoked by the Pass Engine when a
 * freshly produced Candidate Action crosses the salience threshold. Wires
 * three things behind injectable adapters:
 *
 *   - readPreferences(ownerId): User's enabled flag + quiet hours window
 *   - readSubscriptions(ownerId): every active push token for the User
 *   - send(push): Expo Push (iOS / Android) or Web Push call
 *
 * Slice 15 ships the dispatcher + quiet-hours logic + salience threshold.
 * The send adapter is fakeable — the real Expo Push / Web Push adapters
 * land alongside the OAuth-bound credentials they need (deferred per the
 * unblocking comment on #16).
 */

export interface QuietHoursWindow {
  /** HH:MM 24h, e.g. "22:00" */
  start: string;
  /** HH:MM 24h, e.g. "07:00" */
  end: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  quietHours: QuietHoursWindow | null;
}

export interface ActiveSubscription {
  token: string;
  platform: "ios" | "android" | "web";
}

export interface PushPayload {
  token: string;
  platform: ActiveSubscription["platform"];
  title: string;
  body?: string;
  deepLink: string;
}

export type PushSender = (push: PushPayload) => Promise<void>;

export interface DispatcherOptions {
  send: PushSender;
  readPreferences: (ownerId: string) => Promise<NotificationPreferences>;
  readSubscriptions: (ownerId: string) => Promise<ActiveSubscription[]>;
  salienceThreshold: number;
}

export interface DispatchInput {
  ownerId: string;
  relationshipId: string;
  candidateActionId: string;
  salience: number;
  title: string;
  body?: string;
  now: Date;
}

export type DispatchResult =
  | { kind: "sent"; count: number }
  | { kind: "skipped_disabled" }
  | { kind: "skipped_low_salience" }
  | { kind: "queued_quiet_hours" }
  | { kind: "skipped_no_subscriptions" };

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Quiet-hours check. Handles wrap-around windows (e.g. 22:00–07:00) by
 * comparing minute-of-day. Inclusive at both ends so "I want quiet from
 * 22:00 to 07:00" includes 22:00 and 07:00 themselves.
 */
export function isInQuietHours(
  hhmm: string,
  window: QuietHoursWindow | null,
): boolean {
  if (!window) return false;
  const now = parseHM(hhmm);
  const start = parseHM(window.start);
  const end = parseHM(window.end);
  if (start <= end) {
    return now >= start && now <= end;
  }
  // Overnight wrap: now ≥ start OR now ≤ end
  return now >= start || now <= end;
}

function nowHM(now: Date): string {
  const h = String(now.getUTCHours()).padStart(2, "0");
  const m = String(now.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export class NotificationDispatcher {
  private readonly opts: DispatcherOptions;

  constructor(opts: DispatcherOptions) {
    this.opts = opts;
  }

  async maybeDispatch(input: DispatchInput): Promise<DispatchResult> {
    if (input.salience < this.opts.salienceThreshold) {
      return { kind: "skipped_low_salience" };
    }
    const prefs = await this.opts.readPreferences(input.ownerId);
    if (!prefs.enabled) return { kind: "skipped_disabled" };

    if (isInQuietHours(nowHM(input.now), prefs.quietHours)) {
      // Slice 15 policy: queue (not drop) — the queue is the existing
      // `scheduled_passes` infrastructure conceptually; the Edge Function
      // that drains it on quiet-hours end lands with the real Expo Push
      // adapter. For now we return `queued_quiet_hours` so the caller
      // knows to persist intent (or simply re-fire on the next Pass).
      return { kind: "queued_quiet_hours" };
    }

    const subs = await this.opts.readSubscriptions(input.ownerId);
    if (subs.length === 0) return { kind: "skipped_no_subscriptions" };

    const deepLink = `related://relationship/${input.relationshipId}?candidate=${input.candidateActionId}`;

    await Promise.all(
      subs.map((sub) =>
        this.opts.send({
          token: sub.token,
          platform: sub.platform,
          title: input.title,
          body: input.body,
          deepLink,
        }),
      ),
    );
    return { kind: "sent", count: subs.length };
  }
}
