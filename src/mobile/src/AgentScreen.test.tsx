import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  AgentService,
  AgentTurnResult,
  EffectResult,
  Relationship,
  SessionHandle,
  VoiceSessionManager,
} from "@related/shared";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { AgentScreen } from "./AgentScreen";

function fixtureRelationship(over: Partial<Relationship["contact"]> = {}): Relationship {
  return {
    id: "r-1",
    contact: {
      id: "c-1",
      name: "Sam",
      phone: null,
      email: null,
      ...over,
    },
  } as Relationship;
}

type MockedService = {
  runEngagedTurn: jest.Mock;
  executeAction: jest.Mock;
  captureIntentForTurn: jest.Mock;
};

function makeService(): MockedService {
  return {
    runEngagedTurn: jest.fn(),
    executeAction: jest.fn(),
    captureIntentForTurn: jest.fn().mockResolvedValue({ captured: false }),
  };
}

describe("<AgentScreen />", () => {
  it("renders the focused Relationship name in the header", () => {
    const service = makeService();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("on Send: invokes runEngagedTurn with the user's text, then renders the returned Candidate Set", async () => {
    const service = makeService();
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-1",
          type: "ScheduleInteraction",
          payload: {
            time: "2026-05-22T17:00:00Z",
            kind: "coffee",
            contactIds: ["c-1"],
          },
          why: "live intent",
          decisionState: "pending",
        },
        {
          id: "ca-2",
          type: "DoNothing",
          payload: {},
          why: null,
          decisionState: "pending",
        },
      ],
    });

    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "what should I do about Sam",
    );
    fireEvent.press(screen.getByText(/^Send$/));

    await waitFor(() => {
      expect(service.runEngagedTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipId: "r-1",
          userTurn: "what should I do about Sam",
        }),
      );
    });

    expect(await screen.findByText("ScheduleInteraction")).toBeTruthy();
    expect(screen.getByText("DoNothing")).toBeTruthy();
    expect(screen.getByText("live intent")).toBeTruthy();
  });

  it("Accept on a card calls executeAction with the action, and marks the card as Accepted", async () => {
    const service = makeService();
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-1",
          type: "OpenThread",
          payload: { description: "send the book", direction: "me_owes_them" },
          why: null,
          decisionState: "pending",
        },
        {
          id: "ca-2",
          type: "DoNothing",
          payload: {},
          why: null,
          decisionState: "pending",
        },
      ],
    });
    const picked: EffectResult = { kind: "picked", actionId: "ca-1" };
    service.executeAction.mockResolvedValue(picked);

    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "hey",
    );
    fireEvent.press(screen.getByText(/^Send$/));

    await screen.findByText("OpenThread");
    const acceptButtons = screen.getAllByText(/^Accept$/);
    fireEvent.press(acceptButtons[0]);

    await waitFor(() => {
      expect(service.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({ id: "ca-1", type: "OpenThread" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/^Accepted$/i)).toBeTruthy();
    });
    // DoNothing's Accept is still visible (only the OpenThread one was tapped).
    expect(screen.getAllByText(/^Accept$/)).toHaveLength(1);
  });

  it("Decline on a non-DoNothing action sends a DoNothing through Executor (records the decline)", async () => {
    const service = makeService();
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-x",
          type: "SendMessage",
          payload: { channel: "text", contactIds: ["c-1"], body: "Hey Sam" },
          why: null,
          decisionState: "pending",
        },
      ],
    });
    service.executeAction.mockResolvedValue({ kind: "declined", actionId: "ca-x" });

    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "hi",
    );
    fireEvent.press(screen.getByText(/^Send$/));

    await screen.findByText("SendMessage");
    fireEvent.press(screen.getByText(/^Decline$/));

    await waitFor(() => {
      expect(service.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            id: "ca-x",
            type: "DoNothing",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/^Declined$/i)).toBeTruthy();
    });
  });

  it("SendMessage Accept: resolves recipient `to` from the focused Contact's phone (text channel)", async () => {
    const service = makeService();
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-sm",
          type: "SendMessage",
          payload: {
            channel: "text",
            contactIds: ["c-1"],
            body: "Hey Sam",
            // The agent omits `to` — it doesn't know phone numbers. The
            // AgentScreen fills it in from the focused Relationship's
            // Contact at Accept time.
          },
          why: null,
          decisionState: "pending",
        },
      ],
    });
    service.executeAction.mockResolvedValue({
      kind: "picked",
      actionId: "ca-sm",
    });

    render(
      <AgentScreen
        relationship={fixtureRelationship({ phone: "+61400000000" })}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "hi",
    );
    fireEvent.press(screen.getByText(/^Send$/));
    await screen.findByText("SendMessage");
    fireEvent.press(screen.getByText(/^Accept$/));

    await waitFor(() => {
      expect(service.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userEdits: expect.objectContaining({
            payload: expect.objectContaining({
              to: ["+61400000000"],
            }),
          }),
        }),
      );
    });
  });

  it("SendMessage Accept: resolves recipient `to` from the focused Contact's email (email channel)", async () => {
    const service = makeService();
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-sm",
          type: "SendMessage",
          payload: {
            channel: "email",
            contactIds: ["c-1"],
            subject: "Coffee?",
            body: "free this week?",
          },
          why: null,
          decisionState: "pending",
        },
      ],
    });
    service.executeAction.mockResolvedValue({
      kind: "picked",
      actionId: "ca-sm",
    });

    render(
      <AgentScreen
        relationship={fixtureRelationship({ email: "sam@example.com" })}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "hi",
    );
    fireEvent.press(screen.getByText(/^Send$/));
    await screen.findByText("SendMessage");
    fireEvent.press(screen.getByText(/^Accept$/));

    await waitFor(() => {
      expect(service.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userEdits: expect.objectContaining({
            payload: expect.objectContaining({
              to: ["sam@example.com"],
            }),
          }),
        }),
      );
    });
  });

  it("Edit-before-accept (SendMessage): user edits body, Accept sends the edited payload", async () => {
    const service = makeService();
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-sm",
          type: "SendMessage",
          payload: {
            channel: "text",
            contactIds: ["c-1"],
            body: "agent draft",
          },
          why: null,
          decisionState: "pending",
        },
      ],
    });
    service.executeAction.mockResolvedValue({
      kind: "picked",
      actionId: "ca-sm",
    });

    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "hi",
    );
    fireEvent.press(screen.getByText(/^Send$/));

    await screen.findByText("SendMessage");
    fireEvent.press(screen.getByText(/^Edit$/));
    const bodyInput = await screen.findByDisplayValue("agent draft");
    fireEvent.changeText(bodyInput, "my own draft");
    fireEvent.press(screen.getByText(/^Accept$/));

    await waitFor(() => {
      expect(service.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            id: "ca-sm",
            type: "SendMessage",
          }),
          userEdits: expect.objectContaining({
            payload: expect.objectContaining({ body: "my own draft" }),
          }),
        }),
      );
    });
  });

  it("Send: calls captureIntentForTurn before runEngagedTurn so the just-captured intent is in the next Pass", async () => {
    const service = makeService();
    let captureFinished = false;
    service.captureIntentForTurn.mockImplementation(async () => {
      captureFinished = true;
      return { captured: true, content: "plan my birthday", kind: "wants_to" };
    });
    service.runEngagedTurn.mockImplementation(async () => {
      // Ordering invariant: capture must finish before runEngagedTurn fires,
      // so the User Context snapshot reads the just-written intent.
      expect(captureFinished).toBe(true);
      return {
        id: "cs-new",
        ownerId: "u-1",
        relationshipId: "r-1",
        mode: "engaged",
        createdAt: "2026-05-19T00:00:00Z",
        actions: [{ id: "ca-1", type: "DoNothing", payload: {}, why: null, decisionState: "pending" }],
      };
    });

    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "I want to plan my birthday",
    );
    fireEvent.press(screen.getByText(/^Send$/));

    await waitFor(() => {
      expect(service.captureIntentForTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          userTurn: "I want to plan my birthday",
          relationshipId: "r-1",
        }),
      );
    });
    await waitFor(() => {
      expect(service.runEngagedTurn).toHaveBeenCalled();
    });
  });

  it("Renders a subtle annotation in the transcript when intent was captured", async () => {
    const service = makeService();
    service.captureIntentForTurn.mockResolvedValue({
      captured: true,
      content: "plan my birthday",
      kind: "wants_to",
    });
    service.runEngagedTurn.mockResolvedValue({
      id: "cs-new",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [{ id: "ca-1", type: "DoNothing", payload: {}, why: null, decisionState: "pending" }],
    });

    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/message the agent/i),
      "I want to plan my birthday",
    );
    fireEvent.press(screen.getByText(/^Send$/));

    // Acceptance criterion: captured intent is visible in the transcript as
    // a subtle inline annotation so the User knows what was picked up.
    // The label prefix "Intent:" disambiguates from the user bubble.
    expect(
      await screen.findByText(/^Intent: plan my birthday$/),
    ).toBeTruthy();
  });
});

/**
 * Voice toggle test scaffolding. The AgentScreen receives an optional
 * `voiceSessionManager` so the test can inject a fake. The fake records
 * what was called and lets the test trigger the agent-response callback
 * + resolve the turn whenever the test wants.
 */
function makeFakeVoiceManager(): {
  manager: VoiceSessionManager;
  startSession: jest.Mock;
  fakeHandle: SessionHandle & {
    /** Resolve the pending onUserTurn from inside the test. */
    resolveTurn: (result: AgentTurnResult) => void;
    /** Reject the pending onUserTurn (e.g. InterruptedError). */
    rejectTurn: (err: Error) => void;
    /** What the screen registered as its agent response callback. */
    agentCallback: (chunk: Uint8Array) => void;
  };
} {
  let resolveTurn!: (r: AgentTurnResult) => void;
  let rejectTurn!: (e: Error) => void;
  const turnPromise = new Promise<AgentTurnResult>((res, rej) => {
    resolveTurn = res;
    rejectTurn = rej;
  });
  let agentCallback: (chunk: Uint8Array) => void = () => {};
  const interrupt = jest.fn();
  const close = jest.fn();
  const handle = {
    sessionId: "vs-test",
    relationshipId: "r-1",
    onUserTurn: jest.fn().mockReturnValue(turnPromise),
    onAgentResponse: (cb: (chunk: Uint8Array) => void) => {
      agentCallback = cb;
    },
    interrupt,
    close,
    resolveTurn,
    rejectTurn,
    get agentCallback(): (chunk: Uint8Array) => void {
      return agentCallback;
    },
  } as unknown as SessionHandle & {
    resolveTurn: (r: AgentTurnResult) => void;
    rejectTurn: (e: Error) => void;
    agentCallback: (chunk: Uint8Array) => void;
  };
  const startSession = jest.fn().mockReturnValue(handle);
  const manager = { startSession } as unknown as VoiceSessionManager;
  return { manager, startSession, fakeHandle: handle };
}

function makeFakeMicCapture(): jest.Mock<
  Promise<AudioCaptureHandle>,
  []
> {
  let stopCallback: (() => void) | null = null;
  const handle: AudioCaptureHandle = {
    audio: (async function* () {
      await new Promise<void>((resolve) => {
        stopCallback = resolve;
      });
      yield new Uint8Array([0x01]);
    })(),
    stop: () => stopCallback?.(),
  };
  return jest.fn().mockResolvedValue(handle);
}

describe("<AgentScreen /> voice toggle", () => {
  it("renders a Mic button next to Send when a voiceSessionManager is provided", () => {
    const service = makeService();
    const { manager } = makeFakeVoiceManager();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        voiceSessionManager={manager}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(/start voice/i)).toBeTruthy();
  });

  it("does NOT render a Mic button when no voiceSessionManager is provided (text-only mode)", () => {
    const service = makeService();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        onBack={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText(/start voice/i)).toBeNull();
  });

  it("tap Mic → startSession is invoked with the focused Relationship and a turn is started", async () => {
    const service = makeService();
    const { manager, startSession, fakeHandle } = makeFakeVoiceManager();
    const startMicCapture = makeFakeMicCapture();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        voiceSessionManager={manager}
        startMicCapture={startMicCapture}
        onBack={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText(/start voice/i));

    await waitFor(() => {
      expect(startSession).toHaveBeenCalledWith({ relationshipId: "r-1" });
    });
    await waitFor(() => {
      expect((fakeHandle.onUserTurn as jest.Mock)).toHaveBeenCalled();
    });
    expect(screen.getByLabelText(/stop recording/i)).toBeTruthy();
  });

  it("when the voice turn resolves, the Candidate Set is rendered just like text mode", async () => {
    const service = makeService();
    const { manager, fakeHandle } = makeFakeVoiceManager();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        voiceSessionManager={manager}
        startMicCapture={makeFakeMicCapture()}
        onBack={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText(/start voice/i));
    await waitFor(() =>
      expect((fakeHandle.onUserTurn as jest.Mock)).toHaveBeenCalled(),
    );

    fireEvent.press(screen.getByLabelText(/stop recording/i));

    fakeHandle.resolveTurn({
      text: "Suggest coffee with Sam",
      candidateSet: {
        id: "cs-voice",
        ownerId: "u-1",
        relationshipId: "r-1",
        mode: "engaged",
        createdAt: "2026-05-19T00:00:00Z",
        actions: [
          {
            id: "ca-1",
            type: "ScheduleInteraction",
            payload: {
              time: "2026-05-22T17:00:00Z",
              kind: "coffee",
              contactIds: ["c-1"],
            },
            why: "live voice intent",
            decisionState: "pending",
          },
          {
            id: "ca-2",
            type: "DoNothing",
            payload: {},
            why: null,
            decisionState: "pending",
          },
        ],
      },
    });

    expect(await screen.findByText("ScheduleInteraction")).toBeTruthy();
    expect(screen.getByText("live voice intent")).toBeTruthy();
  });

  it("tapping Mic while thinking fires interrupt() (barge-in)", async () => {
    const service = makeService();
    const { manager, fakeHandle } = makeFakeVoiceManager();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        voiceSessionManager={manager}
        startMicCapture={makeFakeMicCapture()}
        onBack={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText(/start voice/i));
    await waitFor(() =>
      expect((fakeHandle.onUserTurn as jest.Mock)).toHaveBeenCalled(),
    );

    fireEvent.press(screen.getByLabelText(/stop recording/i));
    await waitFor(() => {
      expect(screen.getByLabelText(/cancel voice/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText(/cancel voice/i));
    expect(fakeHandle.interrupt).toHaveBeenCalled();
  });

  it("after interrupt the mic returns to idle state and is tappable again", async () => {
    const service = makeService();
    const { manager, fakeHandle } = makeFakeVoiceManager();
    render(
      <AgentScreen
        relationship={fixtureRelationship()}
        agentService={service as unknown as AgentService}
        voiceSessionManager={manager}
        startMicCapture={makeFakeMicCapture()}
        onBack={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText(/start voice/i));
    await waitFor(() =>
      expect((fakeHandle.onUserTurn as jest.Mock)).toHaveBeenCalled(),
    );

    fireEvent.press(screen.getByLabelText(/stop recording/i));
    await waitFor(() => {
      expect(screen.getByLabelText(/cancel voice/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText(/cancel voice/i));
    const interruptError = new Error("voice session turn interrupted");
    interruptError.name = "InterruptedError";
    fakeHandle.rejectTurn(interruptError);

    await waitFor(() => {
      expect(screen.getByLabelText(/start voice/i)).toBeTruthy();
    });
  });
});
