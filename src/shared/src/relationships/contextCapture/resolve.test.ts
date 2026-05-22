import type { ContextCaptureSource } from "../../interactions/InteractionsClient";
import {
  interactionStatusFromCommitmentTiming,
  interactionStatusFromTiming,
  resolveContextCapture,
} from "./resolve";
import type {
  ContactRelationshipTarget,
  ContextCaptureInput,
  GroupRelationshipTarget,
  ResolveContextCaptureOptions,
} from "./types";

const ISO = "2026-05-22T10:00:00.000Z";
const contactTarget: ContactRelationshipTarget = {
  mode: "contact",
  relationshipId: "rel-1",
  contactId: "contact-1",
};
const groupTarget: GroupRelationshipTarget = {
  mode: "group",
  relationshipId: "rel-g",
  groupId: "group-1",
  memberContactIds: ["c-a", "c-b"],
};
const manual = (
  t: ContactRelationshipTarget | GroupRelationshipTarget = contactTarget,
): ResolveContextCaptureOptions => ({ captureSource: "manual", relationshipTarget: t });
const extraction = (
  s: Extract<ContextCaptureSource, "conversational_extraction" | "pocket_extraction">,
  t: ContactRelationshipTarget | GroupRelationshipTarget = contactTarget,
): ResolveContextCaptureOptions => ({
  captureSource: s,
  sourceChatId: "chat-1",
  relationshipTarget: t,
});

describe("timing helpers", () => {
  it("interaction timing", () => {
    expect(interactionStatusFromTiming("past")).toBe("occurred");
    expect(interactionStatusFromTiming("future")).toBe("planned");
  });
  it("commitment timing", () => {
    expect(interactionStatusFromCommitmentTiming("completed")).toBe("occurred");
    expect(interactionStatusFromCommitmentTiming("missed")).toBe("missed");
  });
});

describe("resolveContextCapture", () => {
  it("note manual", () => {
    expect(
      resolveContextCapture({ family: "note", time: ISO, content: "  x  " }, manual()),
    ).toMatchObject({
      table: "interactions",
      kind: "note",
      status: "occurred",
      notes: "x",
      captureSource: "manual",
      sourceChatId: null,
    });
  });
  it("comms manual", () => {
    expect(
      resolveContextCapture(
        { family: "comms", time: ISO, channel: "whatsapp", notes: "hi" },
        manual(),
      ),
    ).toMatchObject({ table: "interactions", kind: "whatsapp", status: "occurred" });
  });
  it("interaction past/future", () => {
    expect(
      resolveContextCapture(
        { family: "interaction", time: ISO, kind: "coffee", notes: null, timing: "past" },
        manual(),
      ),
    ).toMatchObject({ status: "occurred" });
    expect(
      resolveContextCapture(
        { family: "interaction", time: ISO, kind: "dinner", notes: null, timing: "future" },
        manual(),
      ),
    ).toMatchObject({ status: "planned" });
  });
  it("interaction explicit status + extraction provenance", () => {
    expect(
      resolveContextCapture(
        { family: "interaction", time: ISO, kind: "call", notes: null, status: "missed" },
        extraction("pocket_extraction"),
      ),
    ).toMatchObject({
      status: "missed",
      captureSource: "pocket_extraction",
      sourceChatId: "chat-1",
    });
  });
  it("group linkage", () => {
    expect(
      resolveContextCapture(
        { family: "interaction", time: ISO, kind: "event", notes: null, timing: "past" },
        manual(groupTarget),
      ),
    ).toMatchObject({ contactIds: ["c-a", "c-b"], groupId: "group-1" });
  });
  it("commitment planned manual", () => {
    expect(
      resolveContextCapture(
        { family: "commitment", time: ISO, description: "send photos", timing: "planned" },
        manual(),
      ),
    ).toEqual({
      table: "open_threads",
      description: "send photos",
      direction: "me_owes_them",
      relationshipIds: ["rel-1"],
      origin: null,
      communicationStatus: "not_communicated",
      captureSource: "manual",
      sourceChatId: null,
    });
  });
  it("commitment completed/missed", () => {
    expect(
      resolveContextCapture(
        { family: "commitment", time: ISO, description: "done", timing: "completed" },
        manual(),
      ),
    ).toMatchObject({ table: "interactions", status: "occurred", kind: "commitment" });
    expect(
      resolveContextCapture(
        { family: "commitment", time: ISO, description: "nope", timing: "missed" },
        manual(),
      ),
    ).toMatchObject({ table: "interactions", status: "missed" });
  });
  it("commitment extraction defaults", () => {
    expect(
      resolveContextCapture(
        {
          family: "commitment",
          time: ISO,
          description: "r",
          timing: "planned",
          direction: "me_owes_them",
        },
        { ...extraction("conversational_extraction"), relationshipIds: ["rel-1", "rel-2"] },
      ),
    ).toMatchObject({ origin: "self_led", relationshipIds: ["rel-1", "rel-2"] });
    expect(
      resolveContextCapture(
        {
          family: "commitment",
          time: ISO,
          description: "r",
          timing: "planned",
          direction: "they_owe_me",
        },
        extraction("conversational_extraction"),
      ),
    ).toMatchObject({ origin: null });
  });
});

const matrix: Array<[string, ContextCaptureInput, "interactions" | "open_threads"]> = [
  ["note", { family: "note", time: ISO, content: "n" }, "interactions"],
  ["comms", { family: "comms", time: ISO, channel: "email", notes: null }, "interactions"],
  [
    "interaction-past",
    { family: "interaction", time: ISO, kind: "coffee", notes: null, timing: "past" },
    "interactions",
  ],
  [
    "commitment-planned",
    { family: "commitment", time: ISO, description: "d", timing: "planned" },
    "open_threads",
  ],
  [
    "commitment-completed",
    { family: "commitment", time: ISO, description: "d", timing: "completed" },
    "interactions",
  ],
  [
    "commitment-missed",
    { family: "commitment", time: ISO, description: "d", timing: "missed" },
    "interactions",
  ],
];

describe.each(matrix)("%s table + provenance", (_label, input, table) => {
  it("manual", () => {
    const w = resolveContextCapture(input, manual());
    expect(w.table).toBe(table);
    expect(w.captureSource).toBe("manual");
    expect(w.sourceChatId).toBeNull();
  });
  it("pocket_extraction", () => {
    const w = resolveContextCapture(input, extraction("pocket_extraction"));
    expect(w.captureSource).toBe("pocket_extraction");
    expect(w.sourceChatId).toBe("chat-1");
  });
});
