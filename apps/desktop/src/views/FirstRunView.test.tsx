import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { DemoCompanionBridge } from "../lib/bridge.js";
import type { DataStatus, ToolEnvelope } from "../types.js";
import { FirstRunView } from "./FirstRunView.js";

class PartialFirstRunBridge extends DemoCompanionBridge {
  public readonly calls: string[] = [];

  public override async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    this.calls.push(tool);
    if (
      tool === "get_quest_data_status" ||
      tool === "get_training_data_status" ||
      tool === "get_price_data_status"
    ) {
      return {
        data: { state: "never-synced" } as DataStatus as T,
        meta: {
          generatedAt: new Date().toISOString(),
          source: "test",
          provenance: {
            origin: "preview-fixture",
            provider: "explicit first-run test fixture",
            timestamp: new Date().toISOString(),
            freshness: "not-applicable",
            cacheState: "not-applicable",
            warnings: ["Explicit deterministic test fixture."],
          },
        },
      };
    }
    if (tool === "refresh_quest_data") {
      throw new Error("Injected quest provider outage");
    }
    return super.callTool<T>(tool, arguments_);
  }
}

describe("desktop first-run catalogue population", () => {
  it("shows all eleven stages and preserves partial success", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const bridge = new PartialFirstRunBridge("first-run");
    render(
      <FirstRunView
        bridge={bridge}
        runtime={{ ready: true, mode: "browser-preview", message: "Ready" }}
        onComplete={onComplete}
      />,
    );

    await user.type(screen.getByLabelText(/runescape display name/i), "Local Hero");
    await user.click(screen.getByRole("button", { name: /continue to companion/i }));

    expect(await screen.findByText("Runtime ready")).toBeVisible();
    expect(screen.getByText("Database ready")).toBeVisible();
    expect(screen.getByText("Player profile created")).toBeVisible();
    expect(screen.getByText("Public Hiscores refreshed")).toBeVisible();
    expect(screen.getByText("Quest catalogue synchronised")).toBeVisible();
    expect(screen.getByText("Training catalogue synchronised")).toBeVisible();
    expect(screen.getByText("GE catalogue synchronised")).toBeVisible();
    expect(screen.getByText("Historical providers checked")).toBeVisible();
    expect(screen.getByText("Market engine ready")).toBeVisible();
    expect(screen.getByText("Data provenance verified")).toBeVisible();
    expect(screen.getByText("Companion ready")).toBeVisible();
    expect(await screen.findByText(/GC-SYNC-001/)).toBeVisible();
    expect(screen.getByText(/ready with 1 limited capability warning/i)).toBeVisible();
    expect(onComplete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /continue with limited functionality/i }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(
      bridge.calls.filter((tool) =>
        [
          "get_quest_data_status",
          "refresh_quest_data",
          "get_training_data_status",
          "refresh_training_data",
          "get_price_data_status",
          "refresh_price_data",
        ].includes(tool),
      ),
    ).toEqual([
      "get_quest_data_status",
      "refresh_quest_data",
      "get_training_data_status",
      "refresh_training_data",
      "get_price_data_status",
      "refresh_price_data",
    ]);
  });
});
