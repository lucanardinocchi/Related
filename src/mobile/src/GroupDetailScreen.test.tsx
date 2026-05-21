import { render, screen, waitFor } from "@testing-library/react-native";
import type {
  GroupRelationship,
  GroupsClient,
  InteractionsClient,
  OpenThreadsClient,
} from "@related/shared";
import { GroupDetailScreen } from "./GroupDetailScreen";

type MockedGroups = { [K in keyof GroupsClient]: jest.Mock };
type MockedThreads = { [K in keyof OpenThreadsClient]: jest.Mock };
type MockedInteractions = { [K in keyof InteractionsClient]: jest.Mock };

function makeGroups(): MockedGroups {
  return {
    createGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    listMembers: jest.fn(),
    listGroups: jest.fn(),
    listGroupRelationships: jest.fn(),
  };
}

function makeThreads(): MockedThreads {
  return {
    createOpenThread: jest.fn(),
    closeOpenThread: jest.fn(),
    listOpenForUser: jest.fn(),
    listOpenForRelationship: jest.fn(),
    closedPerDay: jest.fn(),
  };
}

function makeInteractions(): MockedInteractions {
  return {
    createInteraction: jest.fn(),
    markMissed: jest.fn(),
    listUpcomingPlanned: jest.fn(),
    listAll: jest.fn(),
    listForGroup: jest.fn(),
    listForContact: jest.fn(),
  };
}

const relationship: GroupRelationship = {
  id: "r-college",
  targetType: "group",
  createdAt: "2026-05-18T00:00:00Z",
  group: {
    id: "g-college",
    name: "college friends",
    createdAt: "2026-05-18T00:00:00Z",
  },
};

describe("<GroupDetailScreen />", () => {
  it("renders the Group name, its members, open threads, and interaction history", async () => {
    const groups = makeGroups();
    const threads = makeThreads();
    const interactions = makeInteractions();
    groups.listMembers.mockResolvedValue([
      {
        id: "c-sam",
        name: "Sam",
        phone: null,
        email: null,
        createdAt: "2026-05-17T00:00:00Z",
      },
      {
        id: "c-jules",
        name: "Jules",
        phone: null,
        email: null,
        createdAt: "2026-05-17T00:00:00Z",
      },
    ]);
    threads.listOpenForRelationship.mockResolvedValue([
      {
        id: "ot-1",
        description: "plan next dinner",
        direction: "me_owes_them",
        createdAt: "2026-05-18T00:00:00Z",
        closedAt: null,
        relationshipIds: ["r-college"],
      },
    ]);
    interactions.listForGroup.mockResolvedValue([
      {
        id: "i-1",
        time: "2026-05-12T19:00:00Z",
        kind: "dinner",
        category: "personal",
        notes: "Vietnamese place",
        status: "occurred",
        contacts: [
          { id: "c-sam", name: "Sam" },
          { id: "c-jules", name: "Jules" },
        ],
      },
    ]);

    render(
      <GroupDetailScreen
        relationship={relationship}
        groupsClient={groups as unknown as GroupsClient}
        openThreadsClient={threads as unknown as OpenThreadsClient}
        interactionsClient={interactions as unknown as InteractionsClient}
        onBack={jest.fn()}
      />,
    );

    await screen.findByText("college friends");
    await screen.findByText("Sam");
    expect(screen.getByText("Jules")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("plan next dinner")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("dinner")).toBeTruthy());

    expect(groups.listMembers).toHaveBeenCalledWith("g-college");
    expect(threads.listOpenForRelationship).toHaveBeenCalledWith("r-college");
    expect(interactions.listForGroup).toHaveBeenCalledWith("g-college");
  });

  it("renders empty states when the Group has no members, threads, or history", async () => {
    const groups = makeGroups();
    const threads = makeThreads();
    const interactions = makeInteractions();
    groups.listMembers.mockResolvedValue([]);
    threads.listOpenForRelationship.mockResolvedValue([]);
    interactions.listForGroup.mockResolvedValue([]);

    render(
      <GroupDetailScreen
        relationship={relationship}
        groupsClient={groups as unknown as GroupsClient}
        openThreadsClient={threads as unknown as OpenThreadsClient}
        interactionsClient={interactions as unknown as InteractionsClient}
        onBack={jest.fn()}
      />,
    );

    await screen.findByText(/no members yet/i);
    expect(screen.getByText(/no open threads/i)).toBeTruthy();
    expect(screen.getByText(/no interactions yet/i)).toBeTruthy();
  });
});
