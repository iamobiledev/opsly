import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeverityBadge, StatusBadge } from "./badges";

describe("incident badges", () => {
  it("renders incident status labels", () => {
    render(<StatusBadge status="acknowledged" />);
    expect(screen.getByText("acknowledged")).toBeInTheDocument();
  });

  it("renders severity labels", () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });
});
