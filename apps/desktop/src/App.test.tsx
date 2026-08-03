import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";

import { App } from "./App.js";
import { DemoCompanionBridge } from "./lib/bridge.js";
import { loadLocalAiSettings } from "./views/AiProvidersView.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("desktop application flows", () => {
  it("completes first-run setup without an AI provider", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("first-run")} />);

    expect(await screen.findByRole("heading", { name: /plan with confidence/i })).toBeVisible();
    expect(
      screen.getByText("Preview data — not connected to RuneScape or your local profile."),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/runescape display name/i), "Local Hero");
    await user.click(screen.getByRole("button", { name: /continue to companion/i }));

    expect(await screen.findByRole("heading", { name: /welcome back, local hero/i })).toBeVisible();
    expect(
      screen.getByText("Preview data — not connected to RuneScape or your local profile."),
    ).toBeVisible();
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
    await user.click(screen.getByRole("button", { name: "Diagnostics" }));

    expect(await screen.findByText(/using retained local data/i)).toBeVisible();
    expect(screen.getByText(/7,310 records/i)).toBeVisible();
  });

  it("shows central health and runs safe diagnostics actions", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("returning")} />);

    await user.click(await screen.findByRole("button", { name: "Diagnostics" }));
    expect(await screen.findByRole("heading", { name: "Diagnostics centre" })).toBeVisible();
    expect(screen.getByText("Overall status")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Database" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Providers and circuit breakers" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Run database integrity check" }));
    expect(await screen.findByText(/integrity check completed/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Export diagnostics" }));
    expect(await screen.findByText(/without profiles, credentials, or paths/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText(/read-only software update check completed/i)).toBeVisible();

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Clear expired quarantine" }));
    expect(await screen.findByText(/active data was preserved/i)).toBeVisible();
  });

  it("shows capability-level provenance and verifies live data explicitly", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("returning")} />);

    await user.click(await screen.findByRole("button", { name: "Data sources" }));
    expect(await screen.findByRole("heading", { name: "Data sources" })).toBeVisible();
    expect(screen.getByText("Public Hiscores")).toBeVisible();
    expect(screen.getByText("RuneScape news context")).toBeVisible();
    expect(screen.getByText("Local private records")).toBeVisible();
    expect(screen.getByText("Optional Alt1 capture")).toBeVisible();
    expect(screen.getAllByText("Preview").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Verify live data now" }));
    expect(await screen.findByText(/all public snapshots refreshed successfully/i)).toBeVisible();
  });

  it("requires confirmation before resetting one open provider circuit", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    render(<App bridge={new DemoCompanionBridge("circuit-open")} />);

    await user.click(await screen.findByRole("button", { name: "Diagnostics" }));
    await user.click(await screen.findByRole("button", { name: "Reset circuit" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(await screen.findByText(/selected provider circuit was reset/i)).toBeVisible();
  });

  it("checks validated releases without downloading or installing assets", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("returning")} />);

    await user.click(await screen.findByRole("button", { name: "Updates" }));
    expect(await screen.findByRole("heading", { name: "Update status" })).toBeVisible();
    expect(await screen.findByText("Version 1.2.0")).toBeVisible();
    expect(screen.getByText("sha256:preview-checksum")).toBeVisible();
    expect(screen.getByText(/published SHA-256 metadata is available/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "View recommended download" })).toHaveAttribute(
      "href",
      expect.stringContaining("Gielinor-Companion-Setup-1.2.0-x64.exe"),
    );
    expect(screen.getByRole("link", { name: "Open official release" })).toHaveAttribute(
      "href",
      expect.stringContaining("github.com/DionCroft/Gielinor-Companion-MCP/releases"),
    );
    await user.click(screen.getByRole("switch", { name: /include pre-releases/i }));
    await user.click(screen.getByRole("button", { name: "Check now" }));
    expect(await screen.findByText(/never downloads, installs, or executes/i)).toBeVisible();
  });

  it("discovers an Ollama model and answers through a validated tool call", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("ai-ready")} />);

    await user.click(await screen.findByRole("button", { name: "AI providers" }));
    await user.click(screen.getByRole("radio", { name: /Ollama/i }));
    await user.click(screen.getByRole("button", { name: /test and discover models/i }));

    expect(await screen.findByRole("option", { name: "qwen3:8b" })).toBeVisible();
    await user.type(
      screen.getByLabelText("Question"),
      "What is the guide price of an abyssal whip?",
    );
    await user.click(screen.getByRole("button", { name: "Ask local model" }));

    expect(
      await screen.findByText(/validated local catalogue lists an Abyssal whip/i),
    ).toBeVisible();
    expect(screen.getByText("search_items")).toBeVisible();
    expect(screen.getByText("succeeded")).toBeVisible();
  });

  it("shows an actionable local provider failure", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("ai-provider-error")} />);

    await user.click(await screen.findByRole("button", { name: "AI providers" }));
    await user.click(screen.getByRole("radio", { name: /LM Studio/i }));
    await user.click(screen.getByRole("button", { name: /test and discover models/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /rejected the request with HTTP 503/i,
    );
  });

  it("exposes audited landmarks, focus navigation, and accessible button names", async () => {
    render(<App bridge={new DemoCompanionBridge("returning")} />);

    await screen.findByRole("heading", { name: /welcome back/i });
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("complementary", { name: "Primary navigation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
  });

  it("rejects a remote model endpoint without leaving local-only mode", async () => {
    const user = userEvent.setup();
    render(<App bridge={new DemoCompanionBridge("ai-ready")} />);

    await user.click(await screen.findByRole("button", { name: "AI providers" }));
    await user.click(screen.getByRole("radio", { name: /Ollama/i }));
    const endpoint = screen.getByLabelText("Local provider endpoint");
    await user.clear(endpoint);
    await user.type(endpoint, "https://models.example.com");
    await user.click(screen.getByRole("button", { name: /test and discover models/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/only loopback HTTP endpoints/i);
    expect(screen.getByRole("switch", { name: "Local-only privacy mode" })).toBeChecked();
  });

  it("repairs malformed persisted local-AI bounds", () => {
    localStorage.setItem(
      "gielinor-companion-local-ai-v1",
      JSON.stringify({
        providerId: "remote-cloud",
        endpoints: { ollama: 42, "lm-studio": null },
        model: 123,
        timeoutMs: 500_000,
        maxToolLoops: 99,
      }),
    );

    expect(loadLocalAiSettings()).toEqual({
      providerId: "none",
      endpoints: {
        ollama: "http://127.0.0.1:11434",
        "lm-studio": "http://127.0.0.1:1234",
      },
      model: "",
      timeoutMs: 30_000,
      maxToolLoops: 4,
    });
  });
});
