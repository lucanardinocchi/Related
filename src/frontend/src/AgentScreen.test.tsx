import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  AgentService,
  EffectResult,
  Relationship,
} from "@related/shared";
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
};

function makeService(): MockedService {
  return {
    runEngagedTurn: jest.fn(),
    executeAction: jest.fn(),
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
      screen.getByPlaceholderText(/say something to Claude/i),
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
      screen.getByPlaceholderText(/say something to Claude/i),
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
      screen.getByPlaceholderText(/say something to Claude/i),
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
      screen.getByPlaceholderText(/say something to Claude/i),
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
      screen.getByPlaceholderText(/say something to Claude/i),
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
      screen.getByPlaceholderText(/say something to Claude/i),
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
});
