import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataOriginBadge } from "./Common.js";

describe("data-origin badges", () => {
  it.each([
    ["live-public", "Live"],
    ["validated-cache", "Cached"],
    ["manual-local", "Manual"],
    ["imported-local", "Imported"],
    ["alt1-confirmed", "Alt1 confirmed"],
    ["derived", "Calculated"],
    ["preview-fixture", "Preview"],
    ["unavailable", "Unavailable"],
  ] as const)("renders %s as %s", (origin, label) => {
    render(<DataOriginBadge origin={origin} provider="test provider" />);
    expect(screen.getByText(label)).toHaveAttribute("data-origin", origin);
  });
});
