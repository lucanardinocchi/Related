import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
  GroupsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import { CreateGroupScreen } from "./CreateGroupScreen";

type MockedGroups = { [K in keyof GroupsClient]: jest.Mock };
type MockedRels = { [K in keyof RelationshipsClient]: jest.Mock };

function makeGroupsMock(): MockedGroups {
  return {
    createGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    listMembers: jest.fn(),
    listGroups: jest.fn(),
    listGroupRelationships: jest.fn(),
  };
}

function makeRelsMock(): MockedRels {
  return {
    createContact: jest.fn(),
    listRelationships: jest.fn(),
    getRelationship: jest.fn(),
  };
}

function rel(over: Partial<Relationship> = {}): Relationship {
  return {
    id: "r-1",
    targetType: "contact",
    createdAt: "2026-05-17T00:00:00Z",
    role: null,
    cadence: null,
    contact: {
      id: "c-1",
      name: "Sam",
      phone: null,
      email: null,
      birthday: null,
      area: null,
      latitude: null,
      longitude: null,
      occupation: null,
      education: null,
      createdAt: "2026-05-17T00:00:00Z",
    },
    ...over,
  };
}

describe("<CreateGroupScreen />", () => {
  it("creates a Group and links each picked member, then notifies the parent", async () => {
    const groups = makeGroupsMock();
    const rels = makeRelsMock();
    rels.listRelationships.mockResolvedValue([
      rel({ id: "r-sam", contact: { ...rel().contact, id: "c-sam", name: "Sam" } }),
      rel({
        id: "r-jules",
        contact: { ...rel().contact, id: "c-jules", name: "Jules" },
      }),
    ]);
    groups.createGroup.mockResolvedValue({
      id: "g-new",
      name: "college friends",
      createdAt: "2026-05-18T00:00:00Z",
    });
    groups.addMember.mockResolvedValue(undefined);
    const onCreated = jest.fn();

    render(
      <CreateGroupScreen
        groupsClient={groups as unknown as GroupsClient}
        relationshipsClient={rels as unknown as RelationshipsClient}
        onCreated={onCreated}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.changeText(
      await screen.findByPlaceholderText(/name/i),
      "college friends",
    );

    // Pick Sam and Jules from the candidate list.
    fireEvent.press(await screen.findByText("Sam"));
    fireEvent.press(screen.getByText("Jules"));

    fireEvent.press(screen.getByText(/create/i));

    await waitFor(() =>
      expect(groups.createGroup).toHaveBeenCalledWith({
        name: "college friends",
      }),
    );
    await waitFor(() =>
      expect(groups.addMember).toHaveBeenCalledWith({
        groupId: "g-new",
        contactId: "c-sam",
      }),
    );
    expect(groups.addMember).toHaveBeenCalledWith({
      groupId: "g-new",
      contactId: "c-jules",
    });
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        id: "g-new",
        name: "college friends",
        createdAt: "2026-05-18T00:00:00Z",
      }),
    );
  });

  it("does not submit with an empty name", async () => {
    const groups = makeGroupsMock();
    const rels = makeRelsMock();
    rels.listRelationships.mockResolvedValue([]);
    render(
      <CreateGroupScreen
        groupsClient={groups as unknown as GroupsClient}
        relationshipsClient={rels as unknown as RelationshipsClient}
        onCreated={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText(/create/i));
    expect(groups.createGroup).not.toHaveBeenCalled();
  });
});
