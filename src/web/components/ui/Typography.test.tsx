import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Display, H1, H2, Eyebrow, Body, Mono } from "./Typography";

describe("Typography primitives", () => {
  it("renders Display as h1 with display-size classes", () => {
    render(<Display>Hello</Display>);
    const el = screen.getByRole("heading", { level: 1, name: "Hello" });
    expect(el.tagName).toBe("H1");
    expect(el.className).toContain("text-[32px]");
  });

  it("renders H1 as h1 with h1-size classes", () => {
    render(<H1>Title</H1>);
    const el = screen.getByRole("heading", { level: 1, name: "Title" });
    expect(el.className).toContain("text-[24px]");
  });

  it("renders H2 as h2", () => {
    render(<H2>Section</H2>);
    const el = screen.getByRole("heading", { level: 2, name: "Section" });
    expect(el.className).toContain("text-[18px]");
  });

  it("renders Eyebrow uppercase + tracked", () => {
    render(<Eyebrow>label</Eyebrow>);
    expect(screen.getByText("label").className).toContain("uppercase");
  });

  it("renders Body as <p> by default", () => {
    render(<Body>copy</Body>);
    const el = screen.getByText("copy");
    expect(el.tagName).toBe("P");
  });

  it("Body honours the `as` prop", () => {
    render(<Body as="div">copy</Body>);
    const el = screen.getByText("copy");
    expect(el.tagName).toBe("DIV");
  });

  it("Mono uses tabular-nums and JetBrains font variable", () => {
    render(<Mono>123</Mono>);
    const el = screen.getByText("123");
    expect(el.className).toContain("tabular-nums");
    expect(el.className).toContain("var(--font-jetbrains-mono)");
  });
});
