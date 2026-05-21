import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
  ClosedPerDayBucket,
  Interaction,
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import { HomeScreen } from "./HomeScreen";

type MockedOpenThreadsClient = {
  [K in keyof OpenThreadsClient]: jest.Mock;
};
type MockedInteractionsClient = {
  [K in keyof InteractionsClient]: jest.Mock;
};
type MockedRelationshipsClient = {
  [K in keyof RelationshipsClient]: jest.Mock;
};

function makeRelationshipsMock(
  list: Relationship[] = [],
): MockedRelationshipsClient {
  return {
    createContact: jest.fn(),
    listRelationships: jest.fn().mockResolvedValue(list),
    getRelationship: jest.fn(),
  } as unknown as MockedRelationshipsClient;
}

function makeMock(): MockedOpenThreadsClient {
  return {
    createOpenThread: jest.fn(),
    closeOpenThread: jest.fn(),
    listOpenForUser: jest.fn(),
    listOpenForRelationship: jest.fn(),
    closedPerDay: jest.fn(),
  };
}

function makeInteractionsMock(): MockedInteractionsClient {
  return {
    createInteraction: jest.fn().mockResolvedValue(""),
    markMissed: jest.fn().mockResolvedValue(undefined),
    listUpcomingPlanned: jest.fn().mockResolvedValue([]),
    listAll: jest.fn().mockResolvedValue([]),
  };
}

function thread(id: string, description: string): OpenThread {
  return {
    id,
    description,
    direction: "me_owes_them",
    origin: null,
    communicationStatus: "not_communicated",
    createdAt: "2026-04-01T10:00:00Z",
    closedAt: null,
    relationshipIds: ["r-1"],
    whyHelpsPerson: null,
    whyICanHelp: null,
  };
}

function zeroBuckets(n: number): ClosedPerDayBucket[] {
  return new Array(n).fill(0).map((_, i) => ({
    date: `2026-04-${String(i + 1).padStart(2, "0")}`,
    count: 0,
  }));
}

describe("<HomeScreen />", () => {
  it("loads open threads + closed-per-day, then passes them into <Home />", async () => {
    const client = makeMock();
    client.listOpenForUser.mockResolvedValue([
      thread("ot-1", "owe Sam a coffee"),
    ]);
    client.closedPerDay.mockResolvedValue(zeroBuckets(60));

    render(
      <HomeScreen
        openThreadsClient={client as unknown as OpenThreadsClient}
        interactionsClient={
          makeInteractionsMock() as unknown as InteractionsClient
        }
        relationshipsClient={
          makeRelationshipsMock() as unknown as RelationshipsClient
        }
        onTalkToClaude={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("owe Sam a coffee")).toBeTruthy();
    });

    // Threads-closed card shows "0" total because every bucket is 0.
    expect(screen.getByText("0")).toBeTruthy();
    expect(client.listOpenForUser).toHaveBeenCalled();
    expect(client.closedPerDay).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it("loads upcoming planned Interactions and renders them under Upcoming", async () => {
    const ot = makeMock();
    ot.listOpenForUser.mockResolvedValue([]);
    ot.closedPerDay.mockResolvedValue(zeroBuckets(60));

    const interactions = makeInteractionsMock();
    const upcoming: Interaction[] = [
      {
        id: "i-1",
        time: "2026-05-20T13:30:00Z",
        kind: "coffee",
        category: "personal",
        notes: null,
        status: "planned",
        contacts: [{ id: "c-1", name: "Sam" }],
      },
    ];
    interactions.listUpcomingPlanned.mockResolvedValue(upcoming);

    render(
      <HomeScreen
        openThreadsClient={ot as unknown as OpenThreadsClient}
        interactionsClient={interactions as unknown as InteractionsClient}
        relationshipsClient={
          makeRelationshipsMock() as unknown as RelationshipsClient
        }
        onTalkToClaude={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    await waitFor(() => {
      // The Upcoming section surfaces the kind (Interaction's defining label)
      // and the linked Contact's name. Exact formatting belongs to <Home />;
      // here we assert these two strings made it through.
      expect(screen.getByText(/coffee/i)).toBeTruthy();
      expect(screen.getByText(/Sam/)).toBeTruthy();
    });

    // No "Nothing coming up" empty state once at least one upcoming exists.
    expect(screen.queryByText(/nothing coming up/i)).toBeNull();
    expect(interactions.listUpcomingPlanned).toHaveBeenCalled();
  });

  it("requests a 60-day window ending today (UTC)", async () => {
    const client = makeMock();
    client.listOpenForUser.mockResolvedValue([]);
    client.closedPerDay.mockResolvedValue(zeroBuckets(60));

    const FIXED_NOW = new Date("2026-05-18T12:00:00Z").getTime();
    jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);

    render(
      <HomeScreen
        openThreadsClient={client as unknown as OpenThreadsClient}
        interactionsClient={
          makeInteractionsMock() as unknown as InteractionsClient
        }
        relationshipsClient={
          makeRelationshipsMock() as unknown as RelationshipsClient
        }
        onTalkToClaude={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(client.closedPerDay).toHaveBeenCalledWith({
        from: "2026-03-20", // 59 days before 2026-05-18 (inclusive window)
        to: "2026-05-18",
      });
    });

    (Date.now as jest.Mock).mockRestore();
  });

  it("Talk to Claude tile opens a Relationship picker; picking one fires onTalkToClaude(relationship)", async () => {
    const ot = makeMock();
    ot.listOpenForUser.mockResolvedValue([]);
    ot.closedPerDay.mockResolvedValue(zeroBuckets(60));

    const relationships: Relationship[] = [
      {
        id: "r-1",
        contact: { id: "c-1", name: "Sam", phone: null, email: null },
      } as Relationship,
      {
        id: "r-2",
        contact: { id: "c-2", name: "Priya", phone: null, email: null },
      } as Relationship,
    ];
    const rels = makeRelationshipsMock(relationships);
    const onTalkToClaude = jest.fn();

    render(
      <HomeScreen
        openThreadsClient={ot as unknown as OpenThreadsClient}
        interactionsClient={
          makeInteractionsMock() as unknown as InteractionsClient
        }
        relationshipsClient={rels as unknown as RelationshipsClient}
        onTalkToClaude={onTalkToClaude}
        onSignOut={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText(/^Talk to Claude$/));
    // Picker lists relationships by Contact name.
    const priyaRow = await screen.findByText("Priya");
    fireEvent.press(priyaRow);

    expect(onTalkToClaude).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r-2" }),
    );
  });
});
