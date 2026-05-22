import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
  AmbientIntelligencePreferencesClient,
  UserContextClient,
} from "@related/shared";
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
    listOperatorStrengths: jest.fn().mockResolvedValue([]),
    addOperatorStrength: jest.fn(),
    updateOperatorStrength: jest.fn(),
    deleteOperatorStrength: jest.fn(),
  };
}

function makeAmbientPrefsMock(): {
  [K in keyof AmbientIntelligencePreferencesClient]: jest.Mock;
} {
  return {
    getPreferences: jest.fn().mockResolvedValue(null),
    isEnabled: jest.fn().mockResolvedValue(true),
    setEnabled: jest.fn().mockResolvedValue({ enabled: false, updatedAt: "x" }),
  };
}

function renderYouScreen(
  userContextClient: UserContextClient,
  ambientIntelligencePreferencesClient?: AmbientIntelligencePreferencesClient,
) {
  return render(
    <YouScreen
      userContextClient={userContextClient}
      ambientIntelligencePreferencesClient={
        ambientIntelligencePreferencesClient ??
        (makeAmbientPrefsMock() as unknown as AmbientIntelligencePreferencesClient)
      }
    />,
  );
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

    renderYouScreen(client as unknown as UserContextClient);

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

    renderYouScreen(client as unknown as UserContextClient);

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

    renderYouScreen(client as unknown as UserContextClient);

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
    renderYouScreen(client as unknown as UserContextClient);
    expect(
      await screen.findByPlaceholderText(/what's going on in your life/i),
    ).toBeTruthy();
  });
});

describe("<YouScreen /> — Ambient Intelligence", () => {
  it("lets the User turn background passes off", async () => {
    const client = makeMock();
    const ambientPrefs = makeAmbientPrefsMock();

    renderYouScreen(
      client as unknown as UserContextClient,
      ambientPrefs as unknown as AmbientIntelligencePreferencesClient,
    );

    const toggle = await screen.findByRole("switch", {
      name: /ambient intelligence/i,
    });
    expect(toggle.props.value).toBe(true);

    fireEvent(toggle, "valueChange", false);

    await waitFor(() =>
      expect(ambientPrefs.setEnabled).toHaveBeenCalledWith(false),
    );
  });
});

describe("<YouScreen /> — Sleep signal platform hint", () => {
  it("renders a 'Sleep signal: iOS only in v1' hint so Android/web Users know why", () => {
    const client = makeMock();
    renderYouScreen(client as unknown as UserContextClient);
    expect(screen.getByText(/sleep signal: iOS only in v1/i)).toBeTruthy();
  });
});
