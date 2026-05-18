import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { GroupRelationship, GroupsClient } from "@related/shared";
import { GroupsListScreen } from "./GroupsListScreen";

type MockedGroups = { [K in keyof GroupsClient]: jest.Mock };

function makeMock(): MockedGroups {
  return {
    createGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    listMembers: jest.fn(),
    listGroups: jest.fn(),
    listGroupRelationships: jest.fn(),
  };
}

function groupRel(over: Partial<GroupRelationship> = {}): GroupRelationship {
  return {
    id: "r-1",
    targetType: "group",
    createdAt: "2026-05-18T00:00:00Z",
    group: {
      id: "g-1",
      name: "college friends",
      createdAt: "2026-05-18T00:00:00Z",
    },
    ...over,
  };
}

describe("<GroupsListScreen />", () => {
  it("renders the Group name for each Group Relationship and invokes onSelect on tap", async () => {
    const groups = makeMock();
    const college = groupRel({ id: "r-college" });
    const running = groupRel({
      id: "r-running",
      group: { id: "g-2", name: "running club", createdAt: "x" },
    });
    groups.listGroupRelationships.mockResolvedValue([college, running]);
    const onSelect = jest.fn();

    render(
      <GroupsListScreen
        groupsClient={groups as unknown as GroupsClient}
        onSelect={onSelect}
        onCreateGroup={jest.fn()}
      />,
    );

    await screen.findByText("college friends");
    expect(screen.getByText("running club")).toBeTruthy();

    fireEvent.press(screen.getByText("college friends"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(college));
  });

  it("renders an empty state when the user has no Groups", async () => {
    const groups = makeMock();
    groups.listGroupRelationships.mockResolvedValue([]);

    render(
      <GroupsListScreen
        groupsClient={groups as unknown as GroupsClient}
        onSelect={jest.fn()}
        onCreateGroup={jest.fn()}
      />,
    );

    expect(await screen.findByText(/no groups yet/i)).toBeTruthy();
  });

  it("calls onCreateGroup when the + New group button is pressed", async () => {
    const groups = makeMock();
    groups.listGroupRelationships.mockResolvedValue([]);
    const onCreateGroup = jest.fn();

    render(
      <GroupsListScreen
        groupsClient={groups as unknown as GroupsClient}
        onSelect={jest.fn()}
        onCreateGroup={onCreateGroup}
      />,
    );

    fireEvent.press(screen.getByText(/new group/i));
    expect(onCreateGroup).toHaveBeenCalled();
  });
});
