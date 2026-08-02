import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DemoCompanionBridge } from "../lib/bridge.js";
import type { DesktopProfile, ToolEnvelope } from "../types.js";
import { ExchangeView } from "./PlanningViews.js";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-08-02T12:00:00.000Z";

const profile: DesktopProfile = {
  id: PROFILE_ID,
  displayName: "Local Hero",
  gameMode: "normal",
  skills: [],
  completedQuestIds: [],
  inProgressQuestIds: [],
  goals: [],
};

function response<T>(data: T): ToolEnvelope<T> {
  return { data, meta: { generatedAt: NOW, source: "explicit automated-test fixture" } };
}

class MarketUiBridge extends DemoCompanionBridge {
  public readonly calls: Array<{ tool: string; arguments: Record<string, unknown> }> = [];

  public override async callTool<T>(
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolEnvelope<T>> {
    this.calls.push({ tool, arguments: arguments_ });
    if (tool === "get_portfolio_summary") {
      return response({
        profileId: PROFILE_ID,
        guideValue: 0,
        knownCostBasis: 0,
        realisedGainLoss: 0,
        unrealisedGuideValueGainLoss: 0,
        pricedItemCount: 0,
        unpricedItemCount: 0,
        stalePriceExposureGp: 0,
        missingPriceItemIds: [],
        concentrationRiskPercent: 0,
        allocation: [],
        calculatedAt: NOW,
        warnings: [],
      }) as ToolEnvelope<T>;
    }
    if (tool === "get_player_holdings") {
      return response(null) as ToolEnvelope<T>;
    }
    if (tool === "upsert_player_holding" || tool === "import_player_holdings") {
      return response({
        schemaVersion: 1,
        snapshotId: "22222222-2222-4222-8222-222222222222",
        profileId: PROFILE_ID,
        capturedAt: NOW,
        source: "manual",
        items: [{ itemId: 4151, quantity: 1 }],
      }) as ToolEnvelope<T>;
    }
    if (tool === "list_ge_trades") {
      return response([]) as ToolEnvelope<T>;
    }
    if (tool === "record_ge_trade") {
      return response({
        schemaVersion: 1,
        id: "33333333-3333-4333-8333-333333333333",
        profileId: PROFILE_ID,
        itemId: 4151,
        side: "buy",
        quantity: 1,
        unitPrice: 0,
        occurredAt: NOW,
        source: "manual",
      }) as ToolEnvelope<T>;
    }
    if (tool === "get_paper_portfolio" || tool === "record_paper_trade") {
      return response({
        schemaVersion: 1,
        profileId: PROFILE_ID,
        initialCashGp: 10_000_000,
        cashGp: 10_000_000,
        holdings: [],
        trades: [],
        createdAt: NOW,
        updatedAt: NOW,
        disclaimer: "Hypothetical fixture only.",
      }) as ToolEnvelope<T>;
    }
    if (tool === "get_market_watchlist") {
      return response([]) as ToolEnvelope<T>;
    }
    if (tool === "create_market_watchlist") {
      return response({
        schemaVersion: 1,
        id: "44444444-4444-4444-8444-444444444444",
        profileId: PROFILE_ID,
        name: "My watchlist",
        itemIds: [],
        createdAt: NOW,
        updatedAt: NOW,
      }) as ToolEnvelope<T>;
    }
    return super.callTool<T>(tool, arguments_);
  }
}

describe("Grand Exchange private-data desktop workflows", () => {
  it("records holdings, journal entries, paper trades and watchlists through MCP tools", async () => {
    const user = userEvent.setup();
    const bridge = new MarketUiBridge("automated-test");
    render(<ExchangeView bridge={bridge} profile={profile} />);

    await user.click(screen.getByRole("tab", { name: "Portfolio" }));
    await user.click(await screen.findByRole("button", { name: "Save confirmed holding" }));

    await user.click(screen.getByRole("tab", { name: "Trade journal" }));
    await user.click(await screen.findByRole("button", { name: "Record manual trade" }));

    await user.click(screen.getByRole("tab", { name: "Paper trading" }));
    await user.click(await screen.findByRole("button", { name: "Record hypothetical trade" }));

    await user.click(screen.getByRole("tab", { name: "Watchlist" }));
    await user.click(await screen.findByRole("button", { name: "Save watchlist" }));

    expect(bridge.calls.map(({ tool }) => tool)).toEqual(
      expect.arrayContaining([
        "upsert_player_holding",
        "record_ge_trade",
        "record_paper_trade",
        "create_market_watchlist",
      ]),
    );
    expect(
      bridge.calls.find(({ tool }) => tool === "upsert_player_holding")?.arguments,
    ).toMatchObject({
      profileId: PROFILE_ID,
      holding: { itemId: 4151, quantity: 1 },
      source: "manual",
    });
  });
});
