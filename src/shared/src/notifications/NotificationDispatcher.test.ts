import {
  NotificationDispatcher,
  isInQuietHours,
  type PushSender,
  type QuietHoursWindow,
} from "./NotificationDispatcher";

describe("isInQuietHours", () => {
  it("treats a same-day window (e.g. 12:00–14:00) inclusively", () => {
    expect(isInQuietHours("13:00", { start: "12:00", end: "14:00" })).toBe(true);
    expect(isInQuietHours("11:59", { start: "12:00", end: "14:00" })).toBe(false);
    expect(isInQuietHours("14:00", { start: "12:00", end: "14:00" })).toBe(true);
  });

  it("treats an overnight window (e.g. 22:00–07:00) wrap-around correctly", () => {
    expect(isInQuietHours("23:00", { start: "22:00", end: "07:00" })).toBe(true);
    expect(isInQuietHours("03:30", { start: "22:00", end: "07:00" })).toBe(true);
    expect(isInQuietHours("12:00", { start: "22:00", end: "07:00" })).toBe(false);
  });

  it("returns false when the window is unset", () => {
    expect(isInQuietHours("03:30", null)).toBe(false);
  });
});

describe("NotificationDispatcher.maybeDispatch", () => {
  function setup(over: { enabled?: boolean; quietHours?: QuietHoursWindow | null } = {}) {
    const send: PushSender = jest.fn().mockResolvedValue(undefined);
    const dispatcher = new NotificationDispatcher({
      send,
      readPreferences: jest.fn().mockResolvedValue({
        enabled: over.enabled ?? true,
        quietHours: over.quietHours === undefined ? null : over.quietHours,
      }),
      readSubscriptions: jest
        .fn()
        .mockResolvedValue([
          { token: "tok-1", platform: "ios" as const },
        ]),
      salienceThreshold: 0.6,
    });
    return { dispatcher, send };
  }

  it("sends the push when salience >= threshold and outside quiet hours", async () => {
    const { dispatcher, send } = setup();
    const result = await dispatcher.maybeDispatch({
      ownerId: "u-1",
      relationshipId: "r-1",
      candidateActionId: "ca-1",
      salience: 0.8,
      title: "Plan a dinner with Sam",
      now: new Date("2026-05-19T12:00:00Z"),
    });
    expect(result.kind).toBe("sent");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "tok-1",
        deepLink: expect.stringContaining("relationship/r-1"),
      }),
    );
  });

  it("drops when notifications are disabled User-wide", async () => {
    const { dispatcher, send } = setup({ enabled: false });
    const result = await dispatcher.maybeDispatch({
      ownerId: "u-1",
      relationshipId: "r-1",
      candidateActionId: "ca-1",
      salience: 0.99,
      title: "Plan a dinner with Sam",
      now: new Date("2026-05-19T12:00:00Z"),
    });
    expect(result.kind).toBe("skipped_disabled");
    expect(send).not.toHaveBeenCalled();
  });

  it("drops when salience is below the threshold", async () => {
    const { dispatcher, send } = setup();
    const result = await dispatcher.maybeDispatch({
      ownerId: "u-1",
      relationshipId: "r-1",
      candidateActionId: "ca-1",
      salience: 0.3,
      title: "Plan",
      now: new Date("2026-05-19T12:00:00Z"),
    });
    expect(result.kind).toBe("skipped_low_salience");
    expect(send).not.toHaveBeenCalled();
  });

  it("queues during quiet hours instead of sending immediately", async () => {
    const { dispatcher, send } = setup({
      quietHours: { start: "22:00", end: "07:00" },
    });
    const result = await dispatcher.maybeDispatch({
      ownerId: "u-1",
      relationshipId: "r-1",
      candidateActionId: "ca-1",
      salience: 0.99,
      title: "Plan",
      now: new Date("2026-05-19T03:30:00Z"),
    });
    expect(result.kind).toBe("queued_quiet_hours");
    expect(send).not.toHaveBeenCalled();
  });

  it("fans out to every active subscription for the User", async () => {
    const send: PushSender = jest.fn().mockResolvedValue(undefined);
    const dispatcher = new NotificationDispatcher({
      send,
      readPreferences: jest
        .fn()
        .mockResolvedValue({ enabled: true, quietHours: null }),
      readSubscriptions: jest
        .fn()
        .mockResolvedValue([
          { token: "tok-ios", platform: "ios" as const },
          { token: "tok-web", platform: "web" as const },
        ]),
      salienceThreshold: 0.5,
    });
    await dispatcher.maybeDispatch({
      ownerId: "u-1",
      relationshipId: "r-1",
      candidateActionId: "ca-1",
      salience: 0.9,
      title: "x",
      now: new Date("2026-05-19T12:00:00Z"),
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: "tok-ios" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: "tok-web" }));
  });
});
