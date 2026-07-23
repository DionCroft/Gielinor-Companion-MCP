import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App.js";
import { DemoCompanionBridge } from "./lib/bridge.js";

describe("desktop application flows", () => {
  it("completes first-run setup without an AI provider", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("first-run")} />);

    expect(await screen.findByRole("heading", { name: /plan with confidence/i })).toBeVisible();
    await user.type(screen.getByLabelText(/runescape display name/i), "Local Hero");
    await user.click(screen.getByRole("button", { name: /continue to companion/i }));

    expect(await screen.findByRole("heading", { name: /welcome back, local hero/i })).toBeVisible();
    expect(screen.getByText(/local & read-only/i)).toBeVisible();
  });

  it("builds a deterministic quest route and checklist", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("returning")} />);

    await user.click(await screen.findByRole("button", { name: "Quest planner" }));
    await user.type(screen.getByLabelText("Search quests"), "plague");
    await user.click(screen.getByRole("button", { name: "Run quest search" }));
    await user.click(await screen.findByRole("button", { name: /plague's end/i }));

    expect(await screen.findByRole("tab", { name: "Dependency route" })).toBeVisible();
    expect(screen.getByText("Within the Light")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Checklist" }));
    expect(screen.getByRole("checkbox", { name: /making history/i })).toBeVisible();
  });

  it("shows cached source data while offline", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("offline")} />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("switch", { name: /use retained local data only/i }));
    await user.click(screen.getByRole("button", { name: "Data sources" }));

    expect(await screen.findByText(/offline mode is active/i)).toBeVisible();
    expect(screen.getByText("7,310")).toBeVisible();
  });
});
