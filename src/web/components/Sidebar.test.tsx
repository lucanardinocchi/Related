import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/relationships",
}));

describe("<Sidebar />", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("collapses nav labels when the user clicks Collapse sidebar", async () => {
    const user = userEvent.setup();
    render(<Sidebar userEmail="user@example.com" gmailConnected={false} />);

    expect(screen.getByText("Relationships")).toBeInTheDocument();

    const aside = document.querySelector("aside")!;
    expect(aside).toBeTruthy();
    expect(aside).toHaveAttribute("data-collapsed", "false");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("Relationships")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Relationships" })).toBeInTheDocument();
  });

  it("opens the feedback modal when the user clicks Feedback", async () => {
    const user = userEvent.setup();
    render(<Sidebar userEmail="user@example.com" gmailConnected={false} />);

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(screen.getByRole("dialog", { name: "Send feedback" })).toBeInTheDocument();
    expect(screen.getByText("Sending as")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Send feedback" }),
    ).toHaveTextContent("user@example.com");
  });

  it("restores labels when the user clicks Expand sidebar", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("related.sidebar.collapsed", "1");
    render(<Sidebar userEmail="user@example.com" gmailConnected={false} />);

    const aside = document.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-collapsed", "true");

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(aside).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Relationships")).toBeInTheDocument();
  });
});
