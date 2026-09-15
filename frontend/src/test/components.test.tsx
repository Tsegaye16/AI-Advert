import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary/ErrorBoundary";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { RunStatusTag } from "../components/ui/StatusTag";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders a recovery UI instead of crashing the app", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("exposes the title as a heading", () => {
    render(<PageHeader title="Assets" description="All artifacts" />);
    expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();
    expect(screen.getByText("All artifacts")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders the title, description, and actions", () => {
    render(
      <EmptyState
        title="No campaigns yet"
        description="Create one to get started"
        actions={<button type="button">New</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No campaigns yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});

describe("RunStatusTag", () => {
  it("maps raw statuses to human labels", () => {
    render(
      <MemoryRouter>
        <RunStatusTag status="storyboard" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("labels failures clearly", () => {
    render(
      <MemoryRouter>
        <RunStatusTag status="failed" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
