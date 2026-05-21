import { render, screen, waitFor } from "@testing-library/react-native";
import type { Interaction, InteractionsClient } from "@related/shared";
import { CalendarScreen } from "./CalendarScreen";

type MockedInteractionsClient = {
  [K in keyof InteractionsClient]: jest.Mock;
};

function makeMock(): MockedInteractionsClient {
  return {
    createInteraction: jest.fn(),
    markMissed: jest.fn(),
    listUpcomingPlanned: jest.fn(),
    listAll: jest.fn(),
  };
}

function interaction(
  id: string,
  time: string,
  kind: string,
  status: Interaction["status"] = "planned",
  contactName = "Sam",
): Interaction {
  return {
    id,
    time,
    kind,
    category: "personal",
    notes: null,
    status,
    contacts: [{ id: `c-${id}`, name: contactName }],
  };
}

describe("<CalendarScreen />", () => {
  it("loads all Interactions and groups them under a single header per UTC date", async () => {
    const client = makeMock();
    client.listAll.mockResolvedValue([
      interaction("i-1", "2026-05-20T09:00:00Z", "coffee"),
      interaction("i-2", "2026-05-20T18:00:00Z", "dinner"),
      interaction("i-3", "2026-05-22T11:00:00Z", "call", "occurred"),
    ]);

    render(
      <CalendarScreen
        interactionsClient={client as unknown as InteractionsClient}
      />,
    );

    await waitFor(() => {
      // Two same-day Interactions sit under one header — i.e. the 2026-05-20
      // header appears once, not twice.
      expect(screen.getAllByText(/^2026-05-20$/)).toHaveLength(1);
    });

    // Both same-day rows render.
    expect(screen.getByText(/coffee/i)).toBeTruthy();
    expect(screen.getByText(/dinner/i)).toBeTruthy();

    // The other date appears as its own header.
    expect(screen.getByText(/^2026-05-22$/)).toBeTruthy();
    expect(screen.getByText(/call/i)).toBeTruthy();

    expect(client.listAll).toHaveBeenCalled();
  });

  it("renders all statuses, not just planned", async () => {
    const client = makeMock();
    client.listAll.mockResolvedValue([
      interaction("i-p", "2026-05-20T09:00:00Z", "coffee", "planned"),
      interaction("i-o", "2026-05-20T18:00:00Z", "dinner", "occurred"),
      interaction("i-m", "2026-05-22T11:00:00Z", "call", "missed"),
    ]);

    render(
      <CalendarScreen
        interactionsClient={client as unknown as InteractionsClient}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/coffee/i)).toBeTruthy();
    });

    expect(screen.getByText(/dinner/i)).toBeTruthy();
    expect(screen.getByText(/call/i)).toBeTruthy();
  });

  it("shows an empty state when the User has no Interactions yet", async () => {
    const client = makeMock();
    client.listAll.mockResolvedValue([]);

    render(
      <CalendarScreen
        interactionsClient={client as unknown as InteractionsClient}
      />,
    );

    await waitFor(() => {
      expect(client.listAll).toHaveBeenCalled();
    });
    expect(screen.getByText(/nothing on the calendar/i)).toBeTruthy();
  });
});
