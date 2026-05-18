import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { UserContextClient } from "@related/shared";
import { YouScreen } from "./YouScreen";

type MockedUC = { [K in keyof UserContextClient]: jest.Mock };

function makeMock(): MockedUC {
  return {
    listGoals: jest.fn().mockResolvedValue([]),
    addGoal: jest.fn(),
    updateGoal: jest.fn(),
    deleteGoal: jest.fn(),
    getSituationalState: jest.fn().mockResolvedValue(null),
    setSituationalState: jest.fn(),
  };
}

describe("<YouScreen /> — Goals & Values", () => {
  it("renders existing goals and lets the User add a new one", async () => {
    const client = makeMock();
    client.listGoals.mockResolvedValue([
      {
        id: "g-1",
        content: "Be more present with family",
        createdAt: "x",
        updatedAt: "x",
      },
    ]);
    client.addGoal.mockResolvedValue({
      id: "g-2",
      content: "Move slow",
      createdAt: "x",
      updatedAt: "x",
    });

    render(
      <YouScreen
        userContextClient={client as unknown as UserContextClient}
      />,
    );

    await screen.findByText("Be more present with family");

    fireEvent.changeText(screen.getByPlaceholderText(/add a goal/i), "Move slow");
    fireEvent.press(screen.getByText(/^add$/i));

    await waitFor(() =>
      expect(client.addGoal).toHaveBeenCalledWith("Move slow"),
    );
  });

  it("deletes a goal when the User confirms", async () => {
    const client = makeMock();
    client.listGoals.mockResolvedValue([
      {
        id: "g-1",
        content: "Be more present with family",
        createdAt: "x",
        updatedAt: "x",
      },
    ]);
    client.deleteGoal.mockResolvedValue(undefined);

    render(
      <YouScreen
        userContextClient={client as unknown as UserContextClient}
      />,
    );

    await screen.findByText("Be more present with family");
    fireEvent.press(screen.getByText(/^delete$/i));
    await waitFor(() => expect(client.deleteGoal).toHaveBeenCalledWith("g-1"));
  });
});

describe("<YouScreen /> — Situational State", () => {
  it("renders the current narrative + lets the User save an update", async () => {
    const client = makeMock();
    client.getSituationalState.mockResolvedValue({
      id: "s-1",
      content: "Just moved to Sydney",
      createdAt: "x",
      updatedAt: "x",
    });
    client.setSituationalState.mockResolvedValue({
      id: "s-1",
      content: "Just moved to Sydney; also new job at Acme",
      createdAt: "x",
      updatedAt: "x",
    });

    render(
      <YouScreen
        userContextClient={client as unknown as UserContextClient}
      />,
    );

    const input = await screen.findByDisplayValue("Just moved to Sydney");

    fireEvent.changeText(input, "Just moved to Sydney; also new job at Acme");
    fireEvent.press(screen.getByText(/save situational state/i));

    await waitFor(() =>
      expect(client.setSituationalState).toHaveBeenCalledWith(
        "Just moved to Sydney; also new job at Acme",
      ),
    );
  });

  it("renders an empty state when no Situational State has been authored", async () => {
    const client = makeMock();
    client.getSituationalState.mockResolvedValue(null);
    render(
      <YouScreen
        userContextClient={client as unknown as UserContextClient}
      />,
    );
    expect(
      await screen.findByPlaceholderText(/what's going on in your life/i),
    ).toBeTruthy();
  });
});
