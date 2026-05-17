import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Relationship } from "@related/shared";
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

describe("<RelationshipDetailScreen />", () => {
  it("renders the contact's name and a back button that calls onBack", () => {
    const onBack = jest.fn();
    render(
      <RelationshipDetailScreen
        relationship={relationship()}
        onBack={onBack}
      />,
    );

    expect(screen.getByText("Sam")).toBeTruthy();

    fireEvent.press(screen.getByText(/back/i));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows phone and email channels when present", () => {
    render(
      <RelationshipDetailScreen
        relationship={relationship({
          contact: {
            id: "c-2",
            name: "Jules",
            phone: "+61 400 000 000",
            email: "jules@example.com",
            createdAt: "2026-05-17T00:00:00Z",
          },
        })}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText("+61 400 000 000")).toBeTruthy();
    expect(screen.getByText("jules@example.com")).toBeTruthy();
  });
});
