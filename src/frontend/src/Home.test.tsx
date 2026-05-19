import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ClosedPerDayBucket, OpenThread } from "@related/shared";
import { Home } from "./Home";

function buckets(counts: number[], startDate = "2026-03-19"): ClosedPerDayBucket[] {
  // 60 buckets oldest → newest, dates derived from startDate.
  return counts.map((count, i) => {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count };
  });
}

function thread(id: string, description: string, createdAt: string): OpenThread {
  return {
    id,
    description,
    direction: "me_owes_them",
    createdAt,
    closedAt: null,
    relationshipIds: ["r-1"],
  };
}

function renderEmpty(props: Partial<React.ComponentProps<typeof Home>> = {}) {
  return render(
    <Home
      openThreads={[]}
      upcomingInteractions={[]}
      closedPerDayLast60={buckets(new Array(60).fill(0))}
      onSignOut={jest.fn()}
      {...props}
    />,
  );
}

describe("<Home /> — section scaffolding", () => {
  it("renders all four section regions when given empty inputs", () => {
    renderEmpty();

    expect(screen.getByText(/^threads closed$/i)).toBeTruthy();
    expect(screen.getByText(/^open threads$/i)).toBeTruthy();
    expect(screen.getByText(/^talk to claude$/i)).toBeTruthy();
    expect(screen.getByText(/^upcoming$/i)).toBeTruthy();
  });

  it("shows an empty-state message under Open Threads when there are none", () => {
    renderEmpty();
    expect(screen.getByText(/no open threads/i)).toBeTruthy();
  });

  it("shows an empty-state message under Upcoming when there are none", () => {
    renderEmpty();
    expect(screen.getByText(/nothing coming up/i)).toBeTruthy();
  });

  it("invokes onTalkToClaude when the Talk to Claude tile is tapped", () => {
    const onTalkToClaude = jest.fn();
    renderEmpty({ onTalkToClaude });
    fireEvent.press(screen.getByText(/^talk to claude$/i));
    expect(onTalkToClaude).toHaveBeenCalledTimes(1);
  });

  it("invokes onSignOut when the sign-out affordance is pressed", () => {
    const onSignOut = jest.fn();
    renderEmpty({ onSignOut });

    fireEvent.press(screen.getByText(/^sign out$/i));

    expect(onSignOut).toHaveBeenCalled();
  });
});

describe("<Home /> — Threads-closed graph card", () => {
  it("shows '0' as the total when nothing has been closed", () => {
    renderEmpty();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("sums the last 30 buckets into the big number", () => {
    const counts = new Array(60).fill(0);
    // Last-30 window: indices 30..59. Put 2 closes in there.
    counts[30] = 2;
    counts[59] = 5;
    // Prior-30 window: indices 0..29. Put 4 closes in there.
    counts[0] = 1;
    counts[15] = 3;

    renderEmpty({ closedPerDayLast60: buckets(counts) });

    expect(screen.getByText("7")).toBeTruthy(); // 2 + 5
  });

  it("renders the trend delta vs the prior 30 days, signed", () => {
    const counts = new Array(60).fill(0);
    counts[0] = 1; // prior total = 1
    counts[59] = 5; // current total = 5 → +4

    renderEmpty({ closedPerDayLast60: buckets(counts) });

    expect(screen.getByText(/\+4 vs prior 30 days/i)).toBeTruthy();
  });

  it("formats a negative trend with a minus sign", () => {
    const counts = new Array(60).fill(0);
    counts[0] = 6; // prior total = 6
    counts[59] = 2; // current total = 2 → −4

    renderEmpty({ closedPerDayLast60: buckets(counts) });

    expect(screen.getByText(/−4 vs prior 30 days/i)).toBeTruthy();
  });

  it("renders one sparkline bar per day in the last 30-day window", () => {
    renderEmpty();
    const sparkline = screen.getByTestId("sparkline-bars");
    expect(sparkline.props.children).toHaveLength(30);
  });
});

describe("<Home /> — Open Threads carousel", () => {
  it("renders one item per open thread", () => {
    renderEmpty({
      openThreads: [
        thread("ot-1", "owe Sam a coffee", "2026-04-01T10:00:00Z"),
        thread("ot-2", "intro Priya to Jules", "2026-05-01T10:00:00Z"),
      ],
    });

    expect(screen.getByText("owe Sam a coffee")).toBeTruthy();
    expect(screen.getByText("intro Priya to Jules")).toBeTruthy();
    expect(screen.queryByText(/no open threads/i)).toBeNull();
  });

  it("renders threads in the order the caller passes them (caller pre-sorts oldest-first)", () => {
    renderEmpty({
      openThreads: [
        thread("ot-old", "older one", "2026-04-01T10:00:00Z"),
        thread("ot-new", "newer one", "2026-05-01T10:00:00Z"),
      ],
    });

    // getAllByText returns matches in tree order, so the array order here
    // is the rendered order.
    const matches = screen.getAllByText(/^(older|newer) one$/);
    expect(matches.map((m) => m.props.children)).toEqual([
      "older one",
      "newer one",
    ]);
  });
});
