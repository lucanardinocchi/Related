import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextOnboardingLauncher } from "./_ContextOnboardingLauncher";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(""),
}));

describe("<ContextOnboardingLauncher />", () => {
  it("renders the setup launcher on the context page", () => {
    render(<ContextOnboardingLauncher />);

    expect(
      screen.getByRole("button", { name: "Set up Related" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Set up Related")).toBeInTheDocument();
  });
});
