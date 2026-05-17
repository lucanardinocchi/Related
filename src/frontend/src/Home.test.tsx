import { fireEvent, render, screen } from "@testing-library/react-native";
import { Home } from "./Home";

function renderEmpty(props: Partial<React.ComponentProps<typeof Home>> = {}) {
  return render(
    <Home
      openThreads={[]}
      upcomingEvents={[]}
      threadsClosedLast30Days={new Array(30).fill(0)}
      onSignOut={jest.fn()}
      {...props}
    />,
  );
}

describe("<Home />", () => {
  it("renders all four section regions when given empty inputs", () => {
    renderEmpty();

    // Four primary section headers all visible (exact match to avoid
    // colliding with empty-state copy like "No open threads").
    expect(screen.getByText(/^threads closed$/i)).toBeTruthy();
    expect(screen.getByText(/^open threads$/i)).toBeTruthy();
    expect(screen.getByText(/^talk to claude$/i)).toBeTruthy();
    expect(screen.getByText(/^upcoming$/i)).toBeTruthy();
  });

  it("shows '0' as the threads-closed count when nothing has been closed", () => {
    renderEmpty();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("shows an empty-state message under Open Threads when there are none", () => {
    renderEmpty();
    expect(screen.getByText(/no open threads/i)).toBeTruthy();
  });

  it("shows an empty-state message under Upcoming when there are none", () => {
    renderEmpty();
    expect(screen.getByText(/nothing coming up/i)).toBeTruthy();
  });

  it("invokes onSignOut when the sign-out affordance is pressed", () => {
    const onSignOut = jest.fn();
    renderEmpty({ onSignOut });

    fireEvent.press(screen.getByText(/^sign out$/i));

    expect(onSignOut).toHaveBeenCalled();
  });
});
