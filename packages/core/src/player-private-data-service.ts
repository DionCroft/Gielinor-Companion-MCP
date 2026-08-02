import { randomUUID } from "node:crypto";

import {
  DEFAULT_MARKET_PREFERENCES,
  GeTradeRecordSchema,
  MarketPreferencesSchema,
  MarketWatchlistSchema,
  PlayerHoldingSchema,
  PlayerHoldingsSnapshotSchema,
  PlayerPrivateDataSourceSchema,
  PaperPortfolioSchema,
  PaperTradeRecordSchema,
  type GeTradeRecord,
  type MarketPreferences,
  type MarketWatchlist,
  type PlayerHolding,
  type PlayerHoldingsSnapshot,
  type PlayerPrivateDataSource,
  type PaperPortfolio,
} from "@gielinor/shared-types";
import { z } from "zod";

import { CompanionError, NotFoundError } from "./errors.js";
import type { PlayerPrivateDataRepository, PlayerProfileRepository } from "./ports.js";

const HoldingsReplacementSchema = z
  .object({
    cashGp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    items: z.array(PlayerHoldingSchema).max(20_000),
  })
  .strict();

const TradeCreateSchema = GeTradeRecordSchema.omit({ id: true, schemaVersion: true });
const TradeUpdateSchema = GeTradeRecordSchema.omit({
  id: true,
  profileId: true,
  schemaVersion: true,
}).partial();

function requireBulkConfirmation(confirmed: boolean): void {
  if (!confirmed) {
    throw new CompanionError(
      "Bulk replacement requires confirmReplace=true",
      "CONFIRMATION_REQUIRED",
      {
        gielinorCode: "GC-DATA-001",
        userMessage: "Confirm the local holdings replacement before it is applied.",
      },
    );
  }
}

function csvCells(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (quoted) {
    throw new CompanionError("Holdings CSV contains an unterminated quoted value", "INVALID_CSV");
  }
  cells.push(current);
  return cells;
}

function parseOptionalInteger(value: string, field: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CompanionError(`Holdings CSV ${field} must be a non-negative integer`, "INVALID_CSV");
  }
  return parsed;
}

function parseHoldingsCsv(content: string): z.infer<typeof HoldingsReplacementSchema> {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    throw new CompanionError("Holdings CSV is empty", "INVALID_CSV");
  }
  const headers = csvCells(lines[0] ?? "").map((header) => header.trim());
  const required = ["itemId", "quantity"];
  for (const header of required) {
    if (!headers.includes(header)) {
      throw new CompanionError(`Holdings CSV is missing the ${header} header`, "INVALID_CSV");
    }
  }
  const index = (header: string) => headers.indexOf(header);
  const items = lines.slice(1).map((line, lineIndex) => {
    const values = csvCells(line);
    const itemId = Number(values[index("itemId")]);
    const quantity = Number(values[index("quantity")]);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      throw new CompanionError(
        `Holdings CSV line ${lineIndex + 2} has an invalid itemId`,
        "INVALID_CSV",
      );
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new CompanionError(
        `Holdings CSV line ${lineIndex + 2} has an invalid quantity`,
        "INVALID_CSV",
      );
    }
    const acquisitionIndex = index("averageAcquisitionPrice");
    const notesIndex = index("notes");
    const averageAcquisitionPrice =
      acquisitionIndex < 0
        ? undefined
        : parseOptionalInteger(values[acquisitionIndex] ?? "", "averageAcquisitionPrice");
    const notes = notesIndex < 0 ? undefined : values[notesIndex]?.trim() || undefined;
    return PlayerHoldingSchema.parse({
      itemId,
      quantity,
      ...(averageAcquisitionPrice === undefined ? {} : { averageAcquisitionPrice }),
      ...(notes === undefined ? {} : { notes }),
    });
  });
  return HoldingsReplacementSchema.parse({ items });
}

function csvEscape(value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export class PlayerPrivateDataService {
  public constructor(
    private readonly repository: PlayerPrivateDataRepository,
    private readonly profiles: PlayerProfileRepository,
  ) {}

  private async requireProfile(profileId: string): Promise<void> {
    if ((await this.profiles.getById(profileId)) === null) {
      throw new NotFoundError("Player profile");
    }
  }

  public async getHoldings(profileId: string): Promise<PlayerHoldingsSnapshot | null> {
    await this.requireProfile(profileId);
    return this.repository.getLatestHoldings(profileId);
  }

  public async replaceHoldings(input: {
    profileId: string;
    cashGp?: number | undefined;
    items: PlayerHolding[];
    source?: PlayerPrivateDataSource | undefined;
    capturedAt?: string | undefined;
    confirmReplace: boolean;
  }): Promise<PlayerHoldingsSnapshot> {
    await this.requireProfile(input.profileId);
    requireBulkConfirmation(input.confirmReplace);
    const replacement = HoldingsReplacementSchema.parse({
      ...(input.cashGp === undefined ? {} : { cashGp: input.cashGp }),
      items: input.items,
    });
    const source = PlayerPrivateDataSourceSchema.parse(input.source ?? "manual");
    return this.repository.saveHoldings(
      PlayerHoldingsSnapshotSchema.parse({
        schemaVersion: 1,
        snapshotId: randomUUID(),
        profileId: input.profileId,
        capturedAt: input.capturedAt ?? new Date().toISOString(),
        source,
        ...replacement,
        items: [...replacement.items].sort((left, right) => left.itemId - right.itemId),
      }),
    );
  }

  public async upsertHolding(input: {
    profileId: string;
    holding: PlayerHolding;
    cashGp?: number | undefined;
    source?: PlayerPrivateDataSource | undefined;
  }): Promise<PlayerHoldingsSnapshot> {
    await this.requireProfile(input.profileId);
    const current = await this.repository.getLatestHoldings(input.profileId);
    const holding = PlayerHoldingSchema.parse(input.holding);
    const items = (current?.items ?? []).filter((item) => item.itemId !== holding.itemId);
    items.push(holding);
    return this.replaceHoldings({
      profileId: input.profileId,
      cashGp: input.cashGp ?? current?.cashGp,
      items,
      source: input.source ?? "manual",
      confirmReplace: true,
    });
  }

  public async importHoldings(input: {
    profileId: string;
    format: "csv" | "json";
    content: string;
    confirmReplace: boolean;
  }): Promise<PlayerHoldingsSnapshot> {
    if (new TextEncoder().encode(input.content).byteLength > 5 * 1024 * 1024) {
      throw new CompanionError(
        "Holdings import exceeds the five-megabyte limit",
        "INPUT_TOO_LARGE",
      );
    }
    requireBulkConfirmation(input.confirmReplace);
    let replacement: z.infer<typeof HoldingsReplacementSchema>;
    if (input.format === "csv") {
      replacement = parseHoldingsCsv(input.content);
    } else {
      try {
        const decoded = JSON.parse(input.content) as unknown;
        const candidate =
          typeof decoded === "object" && decoded !== null && "items" in decoded
            ? decoded
            : { items: decoded };
        replacement = HoldingsReplacementSchema.parse(candidate);
      } catch (error) {
        if (error instanceof CompanionError) {
          throw error;
        }
        throw new CompanionError("Holdings JSON is invalid", "INVALID_JSON", { cause: error });
      }
    }
    return this.replaceHoldings({
      profileId: input.profileId,
      ...replacement,
      source: input.format === "csv" ? "csv-import" : "json-import",
      confirmReplace: true,
    });
  }

  public async exportHoldings(profileId: string, format: "csv" | "json") {
    const snapshot = await this.getHoldings(profileId);
    if (snapshot === null) {
      throw new NotFoundError("Player holdings snapshot");
    }
    if (format === "json") {
      return { format, content: JSON.stringify(snapshot, null, 2), snapshot };
    }
    const rows = ["itemId,quantity,averageAcquisitionPrice,notes"];
    for (const item of snapshot.items) {
      rows.push(
        [item.itemId, item.quantity, item.averageAcquisitionPrice, item.notes]
          .map(csvEscape)
          .join(","),
      );
    }
    return { format, content: `${rows.join("\n")}\n`, snapshot };
  }

  public async recordTrade(input: z.input<typeof TradeCreateSchema>): Promise<GeTradeRecord> {
    await this.requireProfile(input.profileId);
    const parsed = TradeCreateSchema.parse(input);
    return this.repository.saveTrade(
      GeTradeRecordSchema.parse({ schemaVersion: 1, id: randomUUID(), ...parsed }),
    );
  }

  public async listTrades(profileId: string): Promise<GeTradeRecord[]> {
    await this.requireProfile(profileId);
    return this.repository.listTrades(profileId);
  }

  public async updateTrade(
    profileId: string,
    tradeId: string,
    updates: z.input<typeof TradeUpdateSchema>,
  ): Promise<GeTradeRecord> {
    await this.requireProfile(profileId);
    const current = await this.repository.getTrade(profileId, tradeId);
    if (current === null) {
      throw new NotFoundError("Grand Exchange trade record");
    }
    return this.repository.saveTrade(
      GeTradeRecordSchema.parse({ ...current, ...TradeUpdateSchema.parse(updates) }),
    );
  }

  public async removeTrade(profileId: string, tradeId: string): Promise<{ removed: true }> {
    await this.requireProfile(profileId);
    if (!(await this.repository.removeTrade(profileId, tradeId))) {
      throw new NotFoundError("Grand Exchange trade record");
    }
    return { removed: true };
  }

  public async getMarketPreferences(profileId: string): Promise<MarketPreferences> {
    await this.requireProfile(profileId);
    return (await this.repository.getMarketPreferences(profileId)) ?? DEFAULT_MARKET_PREFERENCES;
  }

  public async updateMarketPreferences(
    profileId: string,
    updates: {
      riskTolerance?: MarketPreferences["riskTolerance"] | undefined;
      strategy?: MarketPreferences["strategy"] | undefined;
      maximumAllocationPercent?: number | undefined;
      minimumVolume?: number | undefined;
      maximumVolatility?: number | undefined;
      minimumDataConfidence?: number | undefined;
      avoidNewOrUnstableItems?: boolean | undefined;
    },
  ): Promise<MarketPreferences> {
    const current = await this.getMarketPreferences(profileId);
    const definedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    const preferences = MarketPreferencesSchema.parse({
      ...current,
      ...definedUpdates,
      schemaVersion: 1,
    });
    return this.repository.saveMarketPreferences(profileId, preferences, new Date().toISOString());
  }

  public async createWatchlist(input: {
    profileId: string;
    name: string;
    itemIds?: number[] | undefined;
  }): Promise<MarketWatchlist> {
    await this.requireProfile(input.profileId);
    const now = new Date().toISOString();
    return this.repository.saveWatchlist(
      MarketWatchlistSchema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        profileId: input.profileId,
        name: input.name,
        itemIds: input.itemIds ?? [],
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  public async updateWatchlist(
    profileId: string,
    watchlistId: string,
    updates: { name?: string | undefined; itemIds?: number[] | undefined },
  ): Promise<MarketWatchlist> {
    await this.requireProfile(profileId);
    const current = await this.repository.getWatchlist(profileId, watchlistId);
    if (current === null) {
      throw new NotFoundError("Market watchlist");
    }
    return this.repository.saveWatchlist(
      MarketWatchlistSchema.parse({
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  public async getWatchlists(
    profileId: string,
    watchlistId?: string,
  ): Promise<MarketWatchlist | MarketWatchlist[]> {
    await this.requireProfile(profileId);
    if (watchlistId === undefined) {
      return this.repository.listWatchlists(profileId);
    }
    const watchlist = await this.repository.getWatchlist(profileId, watchlistId);
    if (watchlist === null) {
      throw new NotFoundError("Market watchlist");
    }
    return watchlist;
  }

  public async setSelectedProfile(profileId: string) {
    await this.requireProfile(profileId);
    const selectedAt = new Date().toISOString();
    await this.repository.setSelectedProfile(profileId, selectedAt);
    return { profileId, selectedAt };
  }

  public async getSelectedPlayerSnapshot() {
    const selected = await this.repository.getSelectedProfile();
    if (selected === null) {
      throw new NotFoundError("Selected player profile");
    }
    const profile = await this.profiles.getById(selected.profileId);
    if (profile === null) {
      throw new NotFoundError("Selected player profile");
    }
    const [holdings, marketPreferences] = await Promise.all([
      this.repository.getLatestHoldings(selected.profileId),
      this.getMarketPreferences(selected.profileId),
    ]);
    return { profile, holdings, marketPreferences, selectedAt: selected.selectedAt };
  }

  public async getPaperPortfolio(
    profileId: string,
    initialCashGp = 10_000_000,
  ): Promise<PaperPortfolio> {
    await this.requireProfile(profileId);
    const stored = await this.repository.getPaperPortfolio(profileId);
    if (stored !== null) {
      return stored;
    }
    const now = new Date().toISOString();
    return PaperPortfolioSchema.parse({
      schemaVersion: 1,
      profileId,
      initialCashGp,
      cashGp: initialCashGp,
      holdings: [],
      trades: [],
      createdAt: now,
      updatedAt: now,
      disclaimer:
        "Paper trades are hypothetical and do not place or change any RuneScape Grand Exchange offer.",
    });
  }

  public async recordPaperTrade(input: {
    profileId: string;
    itemId: number;
    side: "buy" | "sell";
    quantity: number;
    unitPrice: number;
    occurredAt?: string | undefined;
    initialCashGp?: number | undefined;
  }): Promise<PaperPortfolio> {
    const current = await this.getPaperPortfolio(input.profileId, input.initialCashGp);
    const trade = PaperTradeRecordSchema.parse({
      id: randomUUID(),
      profileId: input.profileId,
      itemId: input.itemId,
      side: input.side,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      source: "paper-simulation",
    });
    const value = trade.quantity * trade.unitPrice;
    if (!Number.isSafeInteger(value)) {
      throw new CompanionError("Paper trade value exceeds the safe GP range", "NUMERIC_OVERFLOW");
    }
    const holdings = [...current.holdings];
    const index = holdings.findIndex(({ itemId }) => itemId === trade.itemId);
    const existing = index < 0 ? undefined : holdings[index];
    let cashGp = current.cashGp;
    if (trade.side === "buy") {
      if (value > cashGp) {
        throw new CompanionError(
          "Paper portfolio has insufficient simulated cash",
          "INSUFFICIENT_FUNDS",
        );
      }
      const priorQuantity = existing?.quantity ?? 0;
      const priorCost = priorQuantity * (existing?.averageAcquisitionPrice ?? trade.unitPrice);
      const quantity = priorQuantity + trade.quantity;
      if (!Number.isSafeInteger(quantity)) {
        throw new CompanionError(
          "Paper holding quantity exceeds the safe range",
          "NUMERIC_OVERFLOW",
        );
      }
      const updated = PlayerHoldingSchema.parse({
        itemId: trade.itemId,
        quantity,
        averageAcquisitionPrice: Math.round((priorCost + value) / quantity),
        notes: "Paper portfolio only",
      });
      if (index < 0) holdings.push(updated);
      else holdings[index] = updated;
      cashGp -= value;
    } else {
      if (existing === undefined || existing.quantity < trade.quantity) {
        throw new CompanionError(
          "Paper portfolio cannot sell more than it holds",
          "INSUFFICIENT_HOLDINGS",
        );
      }
      const remaining = existing.quantity - trade.quantity;
      if (remaining === 0) holdings.splice(index, 1);
      else holdings[index] = { ...existing, quantity: remaining };
      cashGp += value;
      if (!Number.isSafeInteger(cashGp)) {
        throw new CompanionError(
          "Paper cash balance exceeds the safe GP range",
          "NUMERIC_OVERFLOW",
        );
      }
    }
    return this.repository.savePaperPortfolio(
      PaperPortfolioSchema.parse({
        ...current,
        cashGp,
        holdings: holdings.sort((left, right) => left.itemId - right.itemId),
        trades: [...current.trades, trade],
        updatedAt: new Date().toISOString(),
      }),
    );
  }
}
