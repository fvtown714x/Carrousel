import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Playlists from "./app.playlists";

// Polaris components require an i18n context; stub the heavy imports
vi.mock("@shopify/polaris", () => ({
  Page: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page" data-title={title}>{children}</div>
  ),
  Card: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card">{children}</div>
  ),
  Text: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="text">{children}</p>
  ),
}));

describe("Playlists", () => {
  it("renders the page with the correct title", () => {
    render(<Playlists />);
    expect(screen.getByTestId("page")).toHaveAttribute("data-title", "Playlists");
  });

  it("renders the placeholder text", () => {
    render(<Playlists />);
    expect(screen.getByTestId("text")).toHaveTextContent("Aqui ficam suas playlists");
  });
});
