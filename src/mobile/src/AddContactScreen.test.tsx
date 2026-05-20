import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { RelationshipsClient } from "@related/shared";
import { AddContactScreen } from "./AddContactScreen";

type MockedRels = { [K in keyof RelationshipsClient]: jest.Mock };

function makeMock(): MockedRels {
  return {
    createContact: jest.fn(),
    listRelationships: jest.fn(),
    getRelationship: jest.fn(),
  };
}

describe("<AddContactScreen />", () => {
  it("calls createContact and onCreated when Save is pressed with a name", async () => {
    const rels = makeMock();
    const newContact = {
      id: "c-new",
      name: "Sam",
      phone: null,
      email: null,
      createdAt: "2026-05-17T00:00:00Z",
    };
    rels.createContact.mockResolvedValue(newContact);
    const onCreated = jest.fn();

    render(
      <AddContactScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onCreated={onCreated}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText(/name/i), "Sam");
    fireEvent.press(screen.getByText(/save/i));

    await waitFor(() =>
      expect(rels.createContact).toHaveBeenCalledWith({
        name: "Sam",
        phone: null,
        email: null,
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(newContact));
  });

  it("forwards optional phone and email when present", async () => {
    const rels = makeMock();
    rels.createContact.mockResolvedValue({
      id: "c-1",
      name: "Jules",
      phone: "+61 400",
      email: "j@x.com",
      createdAt: "2026-05-17T00:00:00Z",
    });

    render(
      <AddContactScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onCreated={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText(/name/i), "Jules");
    fireEvent.changeText(screen.getByPlaceholderText(/phone/i), "+61 400");
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "j@x.com");
    fireEvent.press(screen.getByText(/save/i));

    await waitFor(() =>
      expect(rels.createContact).toHaveBeenCalledWith({
        name: "Jules",
        phone: "+61 400",
        email: "j@x.com",
      }),
    );
  });

  it("does not submit when name is empty", () => {
    const rels = makeMock();
    render(
      <AddContactScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onCreated={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText(/save/i));
    expect(rels.createContact).not.toHaveBeenCalled();
  });

  it("shows an error message when createContact fails", async () => {
    const rels = makeMock();
    rels.createContact.mockRejectedValue(new Error("Network down"));
    const onCreated = jest.fn();

    render(
      <AddContactScreen
        relationshipsClient={rels as unknown as RelationshipsClient}
        onCreated={onCreated}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText(/name/i), "Anyone");
    fireEvent.press(screen.getByText(/save/i));

    expect(await screen.findByText(/network down/i)).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
