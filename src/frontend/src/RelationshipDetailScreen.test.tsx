import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import { RelationshipDetailScreen } from "./RelationshipDetailScreen";

function relationship(over: Partial<Relationship> = {}): Relationship {
  return {
    id: "r-1",
    targetType: "contact",
    createdAt: "2026-05-17T00:00:00Z",
    contact: {
      id: "c-1",
      name: "Sam",
      phone: null,
      email: null,
      createdAt: "2026-05-17T00:00:00Z",
    },
    ...over,
  };
}

function thread(over: Partial<OpenThread> = {}): OpenThread {
  return {
    id: "ot-1",
    description: "owe Sam a coffee",
    direction: "me_owes_them",
    createdAt: "2026-04-01T10:00:00Z",
    closedAt: null,
    relationshipIds: ["r-1"],
    ...over,
  };
}

function makeMockOpenThreadsClient(): jest.Mocked<OpenThreadsClient> {
  return {
    createOpenThread: jest.fn(),
    closeOpenThread: jest.fn(),
    listOpenForUser: jest.fn(),
    listOpenForRelationship: jest.fn().mockResolvedValue([]),
    closedPerDay: jest.fn(),
  } as unknown as jest.Mocked<OpenThreadsClient>;
}

function makeMockRelationshipsClient(rels: Relationship[] = []): jest.Mocked<RelationshipsClient> {
  return {
    createContact: jest.fn(),
    listRelationships: jest.fn().mockResolvedValue(rels),
    getRelationship: jest.fn(),
  } as unknown as jest.Mocked<RelationshipsClient>;
}

function makeMockInteractionsClient(): jest.Mocked<InteractionsClient> {
  return {
    createInteraction: jest.fn().mockResolvedValue("i-new"),
    markMissed: jest.fn().mockResolvedValue(undefined),
    listUpcomingPlanned: jest.fn().mockResolvedValue([]),
    listAll: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<InteractionsClient>;
}

function renderScreen(over: {
  relationship?: Relationship;
  openThreadsClient?: jest.Mocked<OpenThreadsClient>;
  relationshipsClient?: jest.Mocked<RelationshipsClient>;
  interactionsClient?: jest.Mocked<InteractionsClient>;
  onBack?: jest.Mock;
} = {}) {
  const rel = over.relationship ?? relationship();
  const openThreadsClient =
    over.openThreadsClient ?? makeMockOpenThreadsClient();
  const relationshipsClient =
    over.relationshipsClient ?? makeMockRelationshipsClient([rel]);
  const interactionsClient =
    over.interactionsClient ?? makeMockInteractionsClient();
  const onBack = over.onBack ?? jest.fn();

  const utils = render(
    <RelationshipDetailScreen
      relationship={rel}
      openThreadsClient={openThreadsClient}
      relationshipsClient={relationshipsClient}
      interactionsClient={interactionsClient}
      onBack={onBack}
    />,
  );
  return {
    ...utils,
    openThreadsClient,
    relationshipsClient,
    interactionsClient,
    onBack,
  };
}

describe("<RelationshipDetailScreen /> — contact info", () => {
  it("renders the contact's name and a back button that calls onBack", () => {
    const { onBack } = renderScreen();
    expect(screen.getByText("Sam")).toBeTruthy();
    fireEvent.press(screen.getByText(/back/i));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows phone and email channels when present", () => {
    renderScreen({
      relationship: relationship({
        contact: {
          id: "c-2",
          name: "Jules",
          phone: "+61 400 000 000",
          email: "jules@example.com",
          createdAt: "2026-05-17T00:00:00Z",
        },
      }),
    });
    expect(screen.getByText("+61 400 000 000")).toBeTruthy();
    expect(screen.getByText("jules@example.com")).toBeTruthy();
  });
});

describe("<RelationshipDetailScreen /> — open threads", () => {
  it("loads and renders open threads for this Relationship on mount", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([
      thread({ description: "owe Sam dinner" }),
    ]);

    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByText("owe Sam dinner")).toBeTruthy();
    });
    expect(openThreadsClient.listOpenForRelationship).toHaveBeenCalledWith(
      "r-1",
    );
  });

  it("shows an empty state when the Relationship has no open threads", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([]);
    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByText(/no open threads/i)).toBeTruthy();
    });
  });

  it("closes a thread when the close affordance is tapped and refetches", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship
      .mockResolvedValueOnce([thread({ description: "owed reply" })])
      .mockResolvedValueOnce([]);
    openThreadsClient.closeOpenThread.mockResolvedValue();

    renderScreen({ openThreadsClient });

    await waitFor(() => expect(screen.getByText("owed reply")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText(/^close$/i));
    });

    expect(openThreadsClient.closeOpenThread).toHaveBeenCalledWith("ot-1");
    await waitFor(() => {
      expect(screen.queryByText("owed reply")).toBeNull();
    });
  });
});

describe("<RelationshipDetailScreen /> — create open thread", () => {
  it("creates an Open Thread linked to this Relationship via the form", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([thread({ description: "just created" })]);
    openThreadsClient.createOpenThread.mockResolvedValue("ot-new");

    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/description/i)).toBeTruthy();
    });

    fireEvent.changeText(
      screen.getByPlaceholderText(/description/i),
      "just created",
    );
    // Direction defaults to me_owes_them; toggle to they_owe_me, then back.
    fireEvent.press(screen.getByText(/they owe me/i));
    fireEvent.press(screen.getByText(/i owe them/i));

    await act(async () => {
      fireEvent.press(screen.getByText(/^create thread$/i));
    });

    expect(openThreadsClient.createOpenThread).toHaveBeenCalledWith({
      description: "just created",
      direction: "me_owes_them",
      relationshipIds: ["r-1"],
    });

    await waitFor(() => {
      expect(screen.getByText("just created")).toBeTruthy();
    });
  });

  it("includes additional Relationships when the User checks them in the picker", async () => {
    const here = relationship();
    const other = relationship({
      id: "r-2",
      contact: {
        id: "c-2",
        name: "Jules",
        phone: null,
        email: null,
        createdAt: "2026-05-17T00:00:00Z",
      },
    });
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([]);
    openThreadsClient.createOpenThread.mockResolvedValue("ot-new");
    const relationshipsClient = makeMockRelationshipsClient([here, other]);

    renderScreen({
      relationship: here,
      openThreadsClient,
      relationshipsClient,
    });

    // Picker lists Jules as an additional option; the current Relationship is
    // implicitly always linked.
    const julesRow = await screen.findByText(/jules/i);
    fireEvent.press(julesRow);

    fireEvent.changeText(
      screen.getByPlaceholderText(/description/i),
      "introduce Sam to Jules",
    );

    await act(async () => {
      fireEvent.press(screen.getByText(/^create thread$/i));
    });

    expect(openThreadsClient.createOpenThread).toHaveBeenCalledWith({
      description: "introduce Sam to Jules",
      direction: "me_owes_them",
      relationshipIds: ["r-1", "r-2"],
    });
  });

  it("logs a past Interaction with this Contact via the inline form", async () => {
    const interactionsClient = makeMockInteractionsClient();
    renderScreen({ interactionsClient });

    // Inline form mirrors the Open Thread form: kind + time + optional notes,
    // bound to status=occurred (past) by default. Existence of the kind
    // placeholder is the contract.
    const kindInput = await screen.findByPlaceholderText(/kind/i);
    fireEvent.changeText(kindInput, "coffee");
    fireEvent.changeText(
      screen.getByPlaceholderText(/when \(iso/i),
      "2026-05-10T09:00:00Z",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/notes/i),
      "Sam's apartment",
    );

    await act(async () => {
      fireEvent.press(screen.getByText(/^log interaction$/i));
    });

    expect(interactionsClient.createInteraction).toHaveBeenCalledWith({
      time: "2026-05-10T09:00:00Z",
      kind: "coffee",
      notes: "Sam's apartment",
      status: "occurred",
      contactIds: ["c-1"],
    });
  });

  it("does not submit the Interaction form when kind or time is empty", async () => {
    const interactionsClient = makeMockInteractionsClient();
    renderScreen({ interactionsClient });

    await screen.findByPlaceholderText(/kind/i);
    await act(async () => {
      fireEvent.press(screen.getByText(/^log interaction$/i));
    });

    expect(interactionsClient.createInteraction).not.toHaveBeenCalled();
  });

  it("does not submit when the description is empty", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([]);
    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/description/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText(/^create thread$/i));
    });

    expect(openThreadsClient.createOpenThread).not.toHaveBeenCalled();
  });
});
