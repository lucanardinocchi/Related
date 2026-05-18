import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
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

function renderScreen(over: {
  relationship?: Relationship;
  openThreadsClient?: jest.Mocked<OpenThreadsClient>;
  relationshipsClient?: jest.Mocked<RelationshipsClient>;
  onBack?: jest.Mock;
} = {}) {
  const rel = over.relationship ?? relationship();
  const openThreadsClient =
    over.openThreadsClient ?? makeMockOpenThreadsClient();
  const relationshipsClient =
    over.relationshipsClient ?? makeMockRelationshipsClient([rel]);
  const onBack = over.onBack ?? jest.fn();

  const utils = render(
    <RelationshipDetailScreen
      relationship={rel}
      openThreadsClient={openThreadsClient}
      relationshipsClient={relationshipsClient}
      onBack={onBack}
    />,
  );
  return { ...utils, openThreadsClient, relationshipsClient, onBack };
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
