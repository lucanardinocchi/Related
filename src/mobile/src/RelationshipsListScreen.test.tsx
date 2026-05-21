import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Relationship, RelationshipsClient } from "@related/shared";
import { RelationshipsListScreen } from "./RelationshipsListScreen";

type MockedRels = { [K in keyof RelationshipsClient]: jest.Mock };

function makeMock(): MockedRels {
  return {
    createContact: jest.fn(),
    listRelationships: jest.fn(),
    getRelationship: jest.fn(),
  };
}

function relationship(over: Partial<Relationship> = {}): Relationship {
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
      occupation: null,
      education: null,
      createdAt: "2026-05-17T00:00:00Z",
    },
    ...over,
  };
}

describe("<RelationshipsListScreen />", () => {
  it("renders the contact name for each relationship and invokes onSelect on tap", async () => {
    const rels = makeMock();
    const sam = relationship({ id: "r-sam" });
    const jules = relationship({
      id: "r-jules",
      contact: { ...relationship().contact, id: "c-2", name: "Jules" },
    });
    rels.listRelationships.mockResolvedValue([sam, jules]);
    const onSelect = jest.fn();

    render(
      <RelationshipsListScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onSelect={onSelect}
        onAddContact={jest.fn()}
      />,
    );

    await screen.findByText("Sam");
    expect(screen.getByText("Jules")).toBeTruthy();

    fireEvent.press(screen.getByText("Sam"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(sam));
  });

  it("renders an empty state when the user has no relationships", async () => {
    const rels = makeMock();
    rels.listRelationships.mockResolvedValue([]);

    render(
      <RelationshipsListScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onSelect={jest.fn()}
        onAddContact={jest.fn()}
      />,
    );

    expect(await screen.findByText(/no relationships yet/i)).toBeTruthy();
  });

  it("calls onAddContact when the + New contact button is pressed", async () => {
    const rels = makeMock();
    rels.listRelationships.mockResolvedValue([]);
    const onAddContact = jest.fn();

    render(
      <RelationshipsListScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onSelect={jest.fn()}
        onAddContact={onAddContact}
      />,
    );

    fireEvent.press(screen.getByText(/new contact/i));
    expect(onAddContact).toHaveBeenCalled();
  });
});
