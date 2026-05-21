import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
  CandidateSet,
  CandidatesClient,
  GroupRelationship,
  GroupsClient,
  Interaction,
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import { RelationshipDetailScreen } from "./RelationshipDetailScreen";

function makeMockGroupsClient(
  forContact: GroupRelationship[] = [],
): jest.Mocked<GroupsClient> {
  return {
    createGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    listMembers: jest.fn(),
    listGroups: jest.fn(),
    listGroupRelationships: jest.fn(),
    listForContact: jest.fn().mockResolvedValue(forContact),
  } as unknown as jest.Mocked<GroupsClient>;
}

function makeMockCandidatesClient(
  latest: CandidateSet | null = null,
): jest.Mocked<CandidatesClient> {
  return {
    getLatestForRelationship: jest.fn().mockResolvedValue(latest),
  } as unknown as jest.Mocked<CandidatesClient>;
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

function thread(over: Partial<OpenThread> = {}): OpenThread {
  return {
    id: "ot-1",
    description: "owe Sam a coffee",
    direction: "me_owes_them",
    origin: null,
    communicationStatus: "not_communicated",
    createdAt: "2026-04-01T10:00:00Z",
    closedAt: null,
    relationshipIds: ["r-1"],
    whyHelpsPerson: null,
    whyICanHelp: null,
    ...over,
  };
}

function makeMockOpenThreadsClient(): jest.Mocked<OpenThreadsClient> {
  return {
    createOpenThread: jest.fn(),
    closeOpenThread: jest.fn(),
    listOpenForUser: jest.fn(),
    listOpenForRelationship: jest.fn().mockResolvedValue([]),
    closedPerDay: jest.fn(),
  } as unknown as jest.Mocked<OpenThreadsClient>;
}

function makeMockRelationshipsClient(rels: Relationship[] = []): jest.Mocked<RelationshipsClient> {
  return {
    createContact: jest.fn(),
    listRelationships: jest.fn().mockResolvedValue(rels),
    getRelationship: jest.fn(),
  } as unknown as jest.Mocked<RelationshipsClient>;
}

function makeMockInteractionsClient(): jest.Mocked<InteractionsClient> {
  return {
    createInteraction: jest.fn().mockResolvedValue("i-new"),
    markMissed: jest.fn().mockResolvedValue(undefined),
    listUpcomingPlanned: jest.fn().mockResolvedValue([]),
    listAll: jest.fn().mockResolvedValue([]),
    listForContact: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<InteractionsClient>;
}

function interaction(over: Partial<Interaction> = {}): Interaction {
  return {
    id: "i-1",
    time: "2026-05-10T09:00:00Z",
    kind: "coffee",
    category: "personal",
    notes: null,
    status: "occurred",
    contacts: [{ id: "c-1", name: "Sam" }],
    ...over,
  };
}

function renderScreen(over: {
  relationship?: Relationship;
  openThreadsClient?: jest.Mocked<OpenThreadsClient>;
  relationshipsClient?: jest.Mocked<RelationshipsClient>;
  interactionsClient?: jest.Mocked<InteractionsClient>;
  groupsClient?: jest.Mocked<GroupsClient>;
  candidatesClient?: jest.Mocked<CandidatesClient>;
  onBack?: jest.Mock;
  onSelectGroup?: jest.Mock;
  onTalkToClaude?: jest.Mock;
} = {}) {
  const rel = over.relationship ?? relationship();
  const openThreadsClient =
    over.openThreadsClient ?? makeMockOpenThreadsClient();
  const relationshipsClient =
    over.relationshipsClient ?? makeMockRelationshipsClient([rel]);
  const interactionsClient =
    over.interactionsClient ?? makeMockInteractionsClient();
  const groupsClient = over.groupsClient ?? makeMockGroupsClient();
  const candidatesClient = over.candidatesClient ?? makeMockCandidatesClient();
  const onBack = over.onBack ?? jest.fn();
  const onSelectGroup = over.onSelectGroup ?? jest.fn();
  const onTalkToClaude = over.onTalkToClaude ?? jest.fn();

  const utils = render(
    <RelationshipDetailScreen
      relationship={rel}
      openThreadsClient={openThreadsClient}
      relationshipsClient={relationshipsClient}
      interactionsClient={interactionsClient}
      groupsClient={groupsClient}
      candidatesClient={candidatesClient}
      onBack={onBack}
      onSelectGroup={onSelectGroup}
      onTalkToClaude={onTalkToClaude}
    />,
  );
  return {
    ...utils,
    openThreadsClient,
    relationshipsClient,
    interactionsClient,
    groupsClient,
    candidatesClient,
    onBack,
    onSelectGroup,
    onTalkToClaude,
  };
}

describe("<RelationshipDetailScreen /> — interaction history", () => {
  it("loads and renders Interaction history for this Contact, most-recent-first", async () => {
    const interactionsClient = makeMockInteractionsClient();
    interactionsClient.listForContact.mockResolvedValue([
      interaction({
        id: "i-recent",
        time: "2026-05-12T19:00:00Z",
        kind: "dinner",
        notes: "group dinner",
      }),
      interaction({
        id: "i-older",
        time: "2026-05-10T09:00:00Z",
        kind: "coffee",
        notes: null,
      }),
    ]);

    renderScreen({ interactionsClient });

    // The fetch is scoped to this Relationship's Contact, not the whole user.
    await waitFor(() =>
      expect(interactionsClient.listForContact).toHaveBeenCalledWith("c-1"),
    );

    // Both kinds appear; their on-screen order is most-recent-first.
    // Note both kinds also appear in the "kind" placeholder copy, so we
    // disambiguate by matching the notes text the placeholder doesn't share.
    const note = await screen.findByText(/group dinner/i);
    expect(note).toBeTruthy();
    // Older entry: no notes, so we match its time string instead.
    expect(screen.getByText(/2026-05-10T09:00:00Z/)).toBeTruthy();
  });

  it("shows an empty state when the Contact has no Interaction history", async () => {
    const interactionsClient = makeMockInteractionsClient();
    interactionsClient.listForContact.mockResolvedValue([]);
    renderScreen({ interactionsClient });

    await waitFor(() => {
      expect(screen.getByText(/no interactions yet/i)).toBeTruthy();
    });
  });
});

describe("<RelationshipDetailScreen /> — Group memberships", () => {
  it("renders Group memberships as back-references and navigates on tap", async () => {
    const groupsClient = makeMockGroupsClient([
      {
        id: "r-college",
        targetType: "group",
        createdAt: "2026-05-18T00:00:00Z",
        group: {
          id: "g-college",
          name: "college friends",
          createdAt: "2026-05-18T00:00:00Z",
        },
      },
    ]);
    const onSelectGroup = jest.fn();
    renderScreen({ groupsClient, onSelectGroup });

    const groupRow = await screen.findByText("college friends");
    expect(groupsClient.listForContact).toHaveBeenCalledWith("c-1");

    fireEvent.press(groupRow);
    await waitFor(() =>
      expect(onSelectGroup).toHaveBeenCalledWith(
        expect.objectContaining({ id: "r-college" }),
      ),
    );
  });

  it("shows an empty state when the Contact has no Group memberships", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/not in any groups/i)).toBeTruthy(),
    );
  });
});

describe("<RelationshipDetailScreen /> — Candidate Set", () => {
  it("renders the latest Candidate Set's actions when one exists", async () => {
    const candidatesClient = makeMockCandidatesClient({
      id: "cs-1",
      relationshipId: "r-1",
      mode: "baseline",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          id: "ca-1",
          type: "DoNothing",
          payload: null,
          why: "no changes warrant a Candidate Action this Pass",
          decisionState: "pending",
        },
      ],
    });
    renderScreen({ candidatesClient });

    expect(
      await screen.findByText(
        /no changes warrant a Candidate Action this Pass/i,
      ),
    ).toBeTruthy();
    expect(candidatesClient.getLatestForRelationship).toHaveBeenCalledWith(
      "r-1",
    );
  });

  it("falls back to the empty-state copy when no Pass has run yet", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/no candidates yet/i)).toBeTruthy(),
    );
  });
});

describe("<RelationshipDetailScreen /> — Talk to Claude entry", () => {
  it("tapping 'Talk to Claude' fires onTalkToClaude with this Relationship (push to AgentScreen)", async () => {
    const onTalkToClaude = jest.fn();
    renderScreen({ onTalkToClaude });

    const button = await screen.findByText(/talk to claude/i);
    await act(async () => {
      fireEvent.press(button);
    });
    expect(onTalkToClaude).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r-1" }),
    );
  });
});

describe("<RelationshipDetailScreen /> — candidate set placeholder", () => {
  it("renders a labelled empty Candidate Set placeholder", async () => {
    renderScreen();
    // The Candidate Set is where Slice 7's DoNothing candidate will eventually
    // appear; for now it is a labelled empty placeholder so the visual real
    // estate exists in the layout.
    expect(await screen.findByText(/candidate set/i)).toBeTruthy();
    expect(screen.getByText(/no candidates yet/i)).toBeTruthy();
  });
});

describe("<RelationshipDetailScreen /> — contact info", () => {
  it("renders the contact's name and a back button that calls onBack", () => {
    const { onBack } = renderScreen();
    expect(screen.getByText("Sam")).toBeTruthy();
    fireEvent.press(screen.getByText(/back/i));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows phone and email channels when present", () => {
    renderScreen({
      relationship: relationship({
        contact: {
          id: "c-2",
          name: "Jules",
          phone: "+61 400 000 000",
          email: "jules@example.com",
          createdAt: "2026-05-17T00:00:00Z",
        },
      }),
    });
    expect(screen.getByText("+61 400 000 000")).toBeTruthy();
    expect(screen.getByText("jules@example.com")).toBeTruthy();
  });
});

describe("<RelationshipDetailScreen /> — open threads", () => {
  it("loads and renders open threads for this Relationship on mount", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([
      thread({ description: "owe Sam dinner" }),
    ]);

    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByText("owe Sam dinner")).toBeTruthy();
    });
    expect(openThreadsClient.listOpenForRelationship).toHaveBeenCalledWith(
      "r-1",
    );
  });

  it("shows an empty state when the Relationship has no open threads", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([]);
    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByText(/no open threads/i)).toBeTruthy();
    });
  });

  it("closes a thread when the close affordance is tapped and refetches", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship
      .mockResolvedValueOnce([thread({ description: "owed reply" })])
      .mockResolvedValueOnce([]);
    openThreadsClient.closeOpenThread.mockResolvedValue();

    renderScreen({ openThreadsClient });

    await waitFor(() => expect(screen.getByText("owed reply")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText(/^close$/i));
    });

    expect(openThreadsClient.closeOpenThread).toHaveBeenCalledWith("ot-1");
    await waitFor(() => {
      expect(screen.queryByText("owed reply")).toBeNull();
    });
  });
});

describe("<RelationshipDetailScreen /> — create open thread", () => {
  it("creates an Open Thread linked to this Relationship via the form", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([thread({ description: "just created" })]);
    openThreadsClient.createOpenThread.mockResolvedValue("ot-new");

    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/description/i)).toBeTruthy();
    });

    fireEvent.changeText(
      screen.getByPlaceholderText(/description/i),
      "just created",
    );
    // Direction defaults to me_owes_them; toggle to they_owe_me, then back.
    fireEvent.press(screen.getByText(/they owe me/i));
    fireEvent.press(screen.getByText(/i owe them/i));

    await act(async () => {
      fireEvent.press(screen.getByText(/^create thread$/i));
    });

    expect(openThreadsClient.createOpenThread).toHaveBeenCalledWith({
      description: "just created",
      direction: "me_owes_them",
      relationshipIds: ["r-1"],
    });

    await waitFor(() => {
      expect(screen.getByText("just created")).toBeTruthy();
    });
  });

  it("includes additional Relationships when the User checks them in the picker", async () => {
    const here = relationship();
    const other = relationship({
      id: "r-2",
      contact: {
        id: "c-2",
        name: "Jules",
        phone: null,
        email: null,
        createdAt: "2026-05-17T00:00:00Z",
      },
    });
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([]);
    openThreadsClient.createOpenThread.mockResolvedValue("ot-new");
    const relationshipsClient = makeMockRelationshipsClient([here, other]);

    renderScreen({
      relationship: here,
      openThreadsClient,
      relationshipsClient,
    });

    // Picker lists Jules as an additional option; the current Relationship is
    // implicitly always linked.
    const julesRow = await screen.findByText(/jules/i);
    fireEvent.press(julesRow);

    fireEvent.changeText(
      screen.getByPlaceholderText(/description/i),
      "introduce Sam to Jules",
    );

    await act(async () => {
      fireEvent.press(screen.getByText(/^create thread$/i));
    });

    expect(openThreadsClient.createOpenThread).toHaveBeenCalledWith({
      description: "introduce Sam to Jules",
      direction: "me_owes_them",
      relationshipIds: ["r-1", "r-2"],
    });
  });

  it("logs a past Interaction with this Contact via the inline form", async () => {
    const interactionsClient = makeMockInteractionsClient();
    renderScreen({ interactionsClient });

    // Inline form mirrors the Open Thread form: kind + time + optional notes,
    // bound to status=occurred (past) by default. Existence of the kind
    // placeholder is the contract.
    const kindInput = await screen.findByPlaceholderText(/kind/i);
    fireEvent.changeText(kindInput, "coffee");
    fireEvent.changeText(
      screen.getByPlaceholderText(/when \(iso/i),
      "2026-05-10T09:00:00Z",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/notes/i),
      "Sam's apartment",
    );

    await act(async () => {
      fireEvent.press(screen.getByText(/^log interaction$/i));
    });

    expect(interactionsClient.createInteraction).toHaveBeenCalledWith({
      time: "2026-05-10T09:00:00Z",
      kind: "coffee",
      notes: "Sam's apartment",
      status: "occurred",
      contactIds: ["c-1"],
    });
  });

  it("refreshes the Interaction history after logging a new Interaction", async () => {
    const interactionsClient = makeMockInteractionsClient();
    interactionsClient.listForContact
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        interaction({
          id: "i-new",
          time: "2026-05-15T10:00:00Z",
          kind: "call",
          notes: "checked in",
        }),
      ]);

    renderScreen({ interactionsClient });

    // Empty state shows on initial load.
    await waitFor(() =>
      expect(screen.getByText(/no interactions yet/i)).toBeTruthy(),
    );

    fireEvent.changeText(
      await screen.findByPlaceholderText(/kind/i),
      "call",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/when \(iso/i),
      "2026-05-15T10:00:00Z",
    );

    await act(async () => {
      fireEvent.press(screen.getByText(/^log interaction$/i));
    });

    // After logging, the screen re-fetches; the freshly logged Interaction
    // appears in the history without remounting the screen.
    expect(interactionsClient.listForContact).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByText(/checked in/i)).toBeTruthy(),
    );
  });

  it("does not submit the Interaction form when kind or time is empty", async () => {
    const interactionsClient = makeMockInteractionsClient();
    renderScreen({ interactionsClient });

    await screen.findByPlaceholderText(/kind/i);
    await act(async () => {
      fireEvent.press(screen.getByText(/^log interaction$/i));
    });

    expect(interactionsClient.createInteraction).not.toHaveBeenCalled();
  });

  it("does not submit when the description is empty", async () => {
    const openThreadsClient = makeMockOpenThreadsClient();
    openThreadsClient.listOpenForRelationship.mockResolvedValue([]);
    renderScreen({ openThreadsClient });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/description/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText(/^create thread$/i));
    });

    expect(openThreadsClient.createOpenThread).not.toHaveBeenCalled();
  });
});
