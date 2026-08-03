import { useMemo, useState, type FormEvent } from "react";
import type {
  DataProvenance,
  GeTradeRecord,
  ManualGeOrderPlan,
  MarketBacktestResult,
  MarketRecommendation,
  MarketWatchlist,
  PaperPortfolio,
  PlayerHolding,
  PlayerHoldingsSnapshot,
  PortfolioSummary,
} from "@gielinor/shared-types";

import {
  DataOriginBadge,
  EmptyState,
  InlineAlert,
  LoadingBlock,
  MetricCard,
  PageHeader,
  StatusPill,
} from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import { formatDate, formatGp, formatNumber, titleCase } from "../lib/format.js";
import {
  ItemSearchFormSchema,
  LevellingPlanFormSchema,
  QuestSearchFormSchema,
  firstError,
} from "../lib/validation.js";
import type {
  CompanionBridge,
  DesktopProfile,
  LocalGoal,
  PriceItem,
  PriceSummary,
  QuestRoute,
  QuestSummary,
  ShoppingList,
  TrainingPlan,
  Valuation,
} from "../types.js";

export function QuestPlannerView({
  bridge,
  profile,
}: {
  bridge: CompanionBridge;
  profile: DesktopProfile;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuestSummary[]>([]);
  const [selected, setSelected] = useState<QuestSummary>();
  const [route, setRoute] = useState<QuestRoute>();
  const [shopping, setShopping] = useState<ShoppingList>();
  const [tab, setTab] = useState<"route" | "checklist" | "shopping">("route");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [questProvenance, setQuestProvenance] = useState<DataProvenance>();
  const [planProvenance, setPlanProvenance] = useState<DataProvenance>();

  async function search(event: FormEvent) {
    event.preventDefault();
    const parsed = QuestSearchFormSchema.safeParse({ query });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<QuestSummary[]>("search_quests", {
        query: parsed.data.query,
        limit: 20,
      });
      setResults(response.data);
      setQuestProvenance(response.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quest search failed");
    } finally {
      setBusy(false);
    }
  }

  async function buildRoute(quest: QuestSummary) {
    setSelected(quest);
    setBusy(true);
    setError(undefined);
    try {
      const [routeResult, shoppingResult] = await Promise.all([
        bridge.callTool<QuestRoute>("create_quest_route", {
          profileId: profile.id,
          quest: quest.id,
        }),
        bridge.callTool<ShoppingList>("create_quest_shopping_list", {
          profileId: profile.id,
          quest: quest.id,
        }),
      ]);
      setRoute(routeResult.data);
      setShopping(shoppingResult.data);
      setPlanProvenance(routeResult.meta.provenance);
      setTab("route");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quest route could not be built");
    } finally {
      setBusy(false);
    }
  }

  async function markStatus(step: QuestRoute["steps"][number], status: string) {
    try {
      await bridge.callTool("set_quest_status", {
        profileId: profile.id,
        quest: step.questId,
        status,
      });
      setRoute((current) =>
        current === undefined
          ? undefined
          : {
              ...current,
              steps: current.steps.map((candidate) =>
                candidate.questId === step.questId
                  ? { ...candidate, status: status as typeof candidate.status }
                  : candidate,
              ),
            },
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quest status was not saved");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Prerequisite intelligence"
        title="Quest planner"
        description="Choose a target, see every dependency, and keep progress as a local checklist."
        actions={
          <div className="tag-row">
            {questProvenance === undefined ? null : (
              <DataOriginBadge
                origin={questProvenance.origin}
                provider={questProvenance.provider}
                timestamp={questProvenance.timestamp}
              />
            )}
            <DataOriginBadge origin="manual-local" provider="Local confirmed quest status" />
          </div>
        }
      />
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      <div className="quest-workspace">
        <aside className="quest-search-panel surface-card">
          <form className="search-field" onSubmit={search}>
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search quests…"
              aria-label="Search quests"
            />
            <button type="submit" className="icon-button" aria-label="Run quest search">
              <Icon name="chevron" />
            </button>
          </form>
          <div className="result-list" aria-live="polite">
            {busy && results.length === 0 ? <LoadingBlock label="Searching quests" /> : null}
            {results.map((quest) => (
              <button
                type="button"
                key={quest.id}
                className={selected?.id === quest.id ? "result-item selected" : "result-item"}
                onClick={() => void buildRoute(quest)}
              >
                <span>
                  <strong>{quest.name}</strong>
                  <small>
                    {quest.difficulty ?? "Quest"} · {quest.questPointReward ?? 0} QP
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
            {!busy && query.length > 0 && results.length === 0 ? (
              <p className="muted-copy centred">No matching quests yet.</p>
            ) : null}
          </div>
        </aside>
        <section className="surface-card quest-detail-panel">
          {route === undefined || selected === undefined ? (
            <EmptyState
              title="Choose a target quest"
              description="Search on the left to build a prerequisite-first route, checklist and shopping list."
            />
          ) : (
            <>
              <div className="quest-title-row">
                <div>
                  <p className="eyebrow">Target quest</p>
                  <h2>{selected.name}</h2>
                </div>
                <StatusPill state="neutral">{selected.difficulty ?? "Quest"}</StatusPill>
                {planProvenance === undefined ? null : (
                  <DataOriginBadge
                    origin={planProvenance.origin}
                    provider={planProvenance.provider}
                    timestamp={planProvenance.timestamp}
                  />
                )}
              </div>
              <div className="tab-list" role="tablist" aria-label="Quest planning views">
                {[
                  ["route", "Dependency route"],
                  ["checklist", "Checklist"],
                  ["shopping", `Shopping (${shopping?.items.length ?? 0})`],
                ].map(([id, label]) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id as typeof tab)}
                    key={id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "route" ? (
                <div className="route-timeline">
                  {route.steps.map((step, index) => (
                    <article className="route-step" key={step.questId}>
                      <span className="route-index">{String(index + 1).padStart(2, "0")}</span>
                      <i className="route-line" />
                      <div>
                        <small>
                          {step.depth === 0 ? "Target" : `Dependency depth ${step.depth}`}
                        </small>
                        <strong>{step.name}</strong>
                        <StatusPill state={step.status === "completed" ? "success" : "neutral"}>
                          {titleCase(step.status)}
                        </StatusPill>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {tab === "checklist" ? (
                <div className="checklist">
                  {route.steps.map((step) => (
                    <label key={step.questId}>
                      <input
                        type="checkbox"
                        checked={step.status === "completed"}
                        onChange={(event) =>
                          void markStatus(
                            step,
                            event.currentTarget.checked ? "completed" : "not-started",
                          )
                        }
                      />
                      <span>
                        <strong>{step.name}</strong>
                        <small>Saved to {profile.displayName}'s local profile</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
              {tab === "shopping" ? (
                <div className="shopping-table">
                  {shopping?.items.map((item) => (
                    <div className="shopping-row" key={`${item.itemId ?? item.name}`}>
                      <span className="item-orb">{item.name.slice(0, 1)}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>Required by {item.requiredByQuestIds.length} route quest(s)</small>
                      </div>
                      <b>× {formatNumber(item.quantity)}</b>
                    </div>
                  ))}
                  {shopping?.items.length === 0 ? (
                    <EmptyState
                      title="No structured items"
                      description="The source does not list any aggregate item requirements for this route."
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function LevellingView({
  bridge,
  profile,
}: {
  bridge: CompanionBridge;
  profile: DesktopProfile;
}) {
  const [skillId, setSkillId] = useState(profile.skills[0]?.skillId ?? "mining");
  const [targetLevel, setTargetLevel] = useState(99);
  const [strategy, setStrategy] = useState<"fastest" | "cheapest" | "balanced" | "afk">(
    profile.preferredPlayStyle ?? "balanced",
  );
  const [budgetGp, setBudgetGp] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(
    profile.availableHoursPerDay === undefined ? "" : String(profile.availableHoursPerDay),
  );
  const [plan, setPlan] = useState<TrainingPlan>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [planProvenance, setPlanProvenance] = useState<DataProvenance>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = LevellingPlanFormSchema.safeParse({
      skillId,
      targetLevel,
      strategy,
      budgetGp,
      hoursPerDay,
    });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await bridge.callTool<TrainingPlan>("create_levelling_plan", {
        profileId: profile.id,
        skillId: parsed.data.skillId,
        targetLevel: parsed.data.targetLevel,
        strategy: parsed.data.strategy,
        ...(parsed.data.budgetGp === "" ? {} : { budgetGp: parsed.data.budgetGp }),
        ...(parsed.data.hoursPerDay === "" ? {} : { hoursPerDay: parsed.data.hoursPerDay }),
        allowVirtualLevels: parsed.data.targetLevel > 120,
      });
      setPlan(result.data);
      setPlanProvenance(result.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Levelling plan could not be created");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Deterministic planning"
        title="Levelling planner"
        description="Compare honest rate ranges and turn a target into explainable stages."
      />
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      <div className="planner-layout">
        <form className="surface-card planner-form" onSubmit={submit}>
          <p className="eyebrow">Plan inputs</p>
          <h2>Define your target</h2>
          <label>
            Skill
            <select
              value={skillId}
              onChange={(event) => setSkillId(event.currentTarget.value as typeof skillId)}
            >
              {(profile.skills.length === 0
                ? ["mining", "herblore", "necromancy"]
                : profile.skills.map((skill) => skill.skillId)
              ).map((skill) => (
                <option value={skill} key={skill}>
                  {titleCase(skill)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target level
            <input
              type="number"
              min={2}
              max={150}
              value={targetLevel}
              onChange={(event) => setTargetLevel(event.currentTarget.valueAsNumber)}
            />
          </label>
          <fieldset>
            <legend>Priority</legend>
            <div className="strategy-grid">
              {[
                ["fastest", "Fastest", "Maximise XP/hour"],
                ["cheapest", "Cheapest", "Minimise known cost"],
                ["balanced", "Balanced", "Rate, cost and focus"],
                ["afk", "Low intensity", "Prefer AFK methods"],
              ].map(([value, label, detail]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="strategy"
                    value={value}
                    checked={strategy === value}
                    onChange={() => setStrategy(value as typeof strategy)}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-columns">
            <label>
              Maximum budget
              <input
                inputMode="numeric"
                value={budgetGp}
                onChange={(event) => setBudgetGp(event.currentTarget.value)}
                placeholder="Optional GP"
              />
            </label>
            <label>
              Hours per day
              <input
                type="number"
                min={0.1}
                max={24}
                step={0.1}
                value={hoursPerDay}
                onChange={(event) => setHoursPerDay(event.currentTarget.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <button className="primary-button wide" type="submit" disabled={busy}>
            {busy ? <span className="spinner small" /> : <Icon name="levelling" />}
            {busy ? "Calculating route…" : "Create levelling plan"}
          </button>
        </form>
        <section className="planner-result">
          {plan === undefined ? (
            <EmptyState
              title="Your plan will appear here"
              description="Set a skill, target and priority. Every stage includes the source assumptions and uncertainty."
            />
          ) : (
            <>
              <div className="plan-summary surface-card">
                <div>
                  <p className="eyebrow">{titleCase(plan.strategy)} route</p>
                  <h2>
                    {titleCase(plan.skillId)} {plan.currentLevel} → {plan.targetLevel}
                  </h2>
                </div>
                <StatusPill state={plan.feasible ? "success" : "warning"}>
                  {plan.feasible ? "Feasible" : "Constraints exceeded"}
                </StatusPill>
                {planProvenance === undefined ? null : (
                  <DataOriginBadge
                    origin={planProvenance.origin}
                    provider={planProvenance.provider}
                    timestamp={planProvenance.timestamp}
                  />
                )}
                <div className="plan-metrics">
                  <div>
                    <span>XP remaining</span>
                    <strong>{formatNumber(plan.experienceRequired)}</strong>
                  </div>
                  <div>
                    <span>Estimated time</span>
                    <strong>
                      {plan.totalHoursRange === undefined
                        ? "Unknown"
                        : `${plan.totalHoursRange.minimum.toFixed(1)}–${plan.totalHoursRange.maximum.toFixed(1)} h`}
                    </strong>
                  </div>
                  <div>
                    <span>Estimated cost</span>
                    <strong>
                      {plan.totalGpRange === undefined
                        ? "Unknown"
                        : `${formatGp(plan.totalGpRange.minimum)}–${formatGp(plan.totalGpRange.maximum)}`}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="stage-list">
                {plan.stages.map((stage, index) => (
                  <article className="surface-card plan-stage" key={`${stage.method.id}-${index}`}>
                    <span className="stage-number">{index + 1}</span>
                    <div className="stage-levels">
                      <small>Levels</small>
                      <strong>
                        {stage.startLevel}–{stage.endLevel}
                      </strong>
                    </div>
                    <div className="stage-main">
                      <h3>{stage.method.name}</h3>
                      <p>{formatNumber(stage.experience)} XP in this stage</p>
                      <div className="tag-row">
                        <StatusPill state="neutral">
                          {stage.method.afkRating ?? "Unknown"} AFK
                        </StatusPill>
                        <span>
                          {stage.hoursRange.minimum.toFixed(1)}–
                          {stage.hoursRange.maximum.toFixed(1)} h
                        </span>
                      </div>
                    </div>
                    <strong className="stage-cost">
                      {stage.gpRange === undefined
                        ? "Cost unknown"
                        : formatGp(stage.gpRange.maximum)}
                    </strong>
                  </article>
                ))}
              </div>
              {plan.warnings.map((warning) => (
                <InlineAlert tone="warning" key={warning}>
                  {warning}
                </InlineAlert>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function PriceChart({ summary }: { summary: PriceSummary }) {
  const dimensions = { width: 720, height: 260, padding: 28 };
  const points = summary.chart;
  if (points.length === 0) {
    return (
      <EmptyState
        title="No retained chart points"
        description="The current guide price remains available, but this source returned no history."
      />
    );
  }
  const prices = points.map((point) => point.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const spread = Math.max(1, maximum - minimum);
  const path = points
    .map((point, index) => {
      const x =
        dimensions.padding +
        (index / Math.max(1, points.length - 1)) * (dimensions.width - dimensions.padding * 2);
      const y =
        dimensions.height -
        dimensions.padding -
        ((point.price - minimum) / spread) * (dimensions.height - dimensions.padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="price-chart">
      <svg
        role="img"
        aria-label={`${summary.name} guide-price history from ${formatNumber(minimum)} to ${formatNumber(maximum)} GP`}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#62deb0" stopOpacity=".3" />
            <stop offset="1" stopColor="#62deb0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((position) => (
          <line
            key={position}
            x1={dimensions.padding}
            x2={dimensions.width - dimensions.padding}
            y1={dimensions.height * position}
            y2={dimensions.height * position}
            className="chart-gridline"
          />
        ))}
        <path
          d={`${path} L ${dimensions.width - dimensions.padding} ${dimensions.height - dimensions.padding} L ${dimensions.padding} ${dimensions.height - dimensions.padding} Z`}
          fill="url(#chart-fill)"
        />
        <path d={path} className="chart-line" />
        {points.map((point, index) => {
          const x =
            dimensions.padding +
            (index / Math.max(1, points.length - 1)) * (dimensions.width - dimensions.padding * 2);
          const y =
            dimensions.height -
            dimensions.padding -
            ((point.price - minimum) / spread) * (dimensions.height - dimensions.padding * 2);
          return <circle key={point.timestamp} cx={x} cy={y} r="3.4" className="chart-point" />;
        })}
      </svg>
      <div className="chart-axis">
        <span>{formatDate(points[0]?.timestamp)}</span>
        <span>{formatDate(points.at(-1)?.timestamp)}</span>
      </div>
    </div>
  );
}

const EXCHANGE_TABS = [
  "Market overview",
  "Buy candidates",
  "Sell candidates",
  "Watchlist",
  "Item analysis",
  "Portfolio",
  "Trade journal",
  "Paper trading",
  "Backtests",
  "Data status",
] as const;

type ExchangeTab = (typeof EXCHANGE_TABS)[number];

export function ExchangeView({
  bridge,
  profile,
}: {
  bridge: CompanionBridge;
  profile: DesktopProfile;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PriceItem[]>([]);
  const [summary, setSummary] = useState<PriceSummary>();
  const [analysis, setAnalysis] = useState<MarketRecommendation>();
  const [scan, setScan] = useState<MarketRecommendation[]>([]);
  const [orderPlans, setOrderPlans] = useState<Record<number, ManualGeOrderPlan>>({});
  const [portfolio, setPortfolio] = useState<PortfolioSummary>();
  const [holdings, setHoldings] = useState<PlayerHoldingsSnapshot | null>();
  const [paper, setPaper] = useState<PaperPortfolio>();
  const [backtest, setBacktest] = useState<MarketBacktestResult>();
  const [journal, setJournal] = useState<GeTradeRecord[]>([]);
  const [watchlists, setWatchlists] = useState<MarketWatchlist[]>([]);
  const [dataStatus, setDataStatus] = useState<Record<string, unknown>>();
  const [tab, setTab] = useState<ExchangeTab>("Market overview");
  const [selectedItemId, setSelectedItemId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [marketProvenance, setMarketProvenance] = useState<DataProvenance>();
  const [analysisProvenance, setAnalysisProvenance] = useState<DataProvenance>();
  const [privateProvenance, setPrivateProvenance] = useState<DataProvenance>();
  const [holdingItemId, setHoldingItemId] = useState(4151);
  const [holdingQuantity, setHoldingQuantity] = useState(1);
  const [holdingCost, setHoldingCost] = useState("");
  const [holdingCash, setHoldingCash] = useState("");
  const [holdingNotes, setHoldingNotes] = useState("");
  const [holdingsFormat, setHoldingsFormat] = useState<"csv" | "json">("json");
  const [holdingsTransfer, setHoldingsTransfer] = useState("");
  const [tradeItemId, setTradeItemId] = useState(4151);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [tradePrice, setTradePrice] = useState(0);
  const [paperItemId, setPaperItemId] = useState(4151);
  const [paperSide, setPaperSide] = useState<"buy" | "sell">("buy");
  const [paperQuantity, setPaperQuantity] = useState(1);
  const [paperPrice, setPaperPrice] = useState(0);
  const [watchlistName, setWatchlistName] = useState("My watchlist");
  const [watchlistItems, setWatchlistItems] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    const parsed = ItemSearchFormSchema.safeParse({ query });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<PriceItem[]>("search_items", {
        query: parsed.data.query,
        limit: 20,
      });
      setResults(response.data);
      setMarketProvenance(response.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Item search failed");
    } finally {
      setBusy(false);
    }
  }

  async function select(item: PriceItem) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<PriceSummary>("get_item_price_summary", {
        item: item.itemId,
        range: "30d",
      });
      setSummary(response.data);
      setMarketProvenance(response.meta.provenance);
      setSelectedItemId(item.itemId);
      try {
        const analysed = await bridge.callTool<MarketRecommendation>("analyse_ge_item", {
          profileId: profile.id,
          item: item.itemId,
        });
        setAnalysis(analysed.data);
        setAnalysisProvenance(analysed.meta.provenance);
      } catch {
        setAnalysis(undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Price history failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadTab(next: ExchangeTab) {
    setTab(next);
    setError(undefined);
    setBusy(true);
    try {
      if (next === "Buy candidates" || next === "Sell candidates") {
        if (results.length === 0) {
          setScan([]);
        } else {
          const response = await bridge.callTool<MarketRecommendation[]>(
            next === "Buy candidates" ? "get_ge_buy_candidates" : "get_ge_sell_candidates",
            { profileId: profile.id, items: results.map(({ itemId }) => itemId) },
          );
          setScan(response.data);
          setAnalysisProvenance(response.meta.provenance);
          const planned = await Promise.allSettled(
            response.data.map((candidate) =>
              bridge.callTool<ManualGeOrderPlan>("create_manual_ge_order_plan", {
                profileId: profile.id,
                item: candidate.itemId,
              }),
            ),
          );
          setOrderPlans(
            Object.fromEntries(
              planned.flatMap((result) =>
                result.status === "fulfilled"
                  ? [[result.value.data.analysis.itemId, result.value.data] as const]
                  : [],
              ),
            ),
          );
        }
      } else if (next === "Portfolio") {
        const [portfolioResponse, holdingsResponse] = await Promise.all([
          bridge.callTool<PortfolioSummary>("get_portfolio_summary", {
            profileId: profile.id,
          }),
          bridge.callTool<PlayerHoldingsSnapshot | null>("get_player_holdings", {
            profileId: profile.id,
          }),
        ]);
        setPortfolio(portfolioResponse.data);
        setHoldings(holdingsResponse.data);
        setAnalysisProvenance(portfolioResponse.meta.provenance);
        setPrivateProvenance(holdingsResponse.meta.provenance);
      } else if (next === "Trade journal") {
        const response = await bridge.callTool<GeTradeRecord[]>("list_ge_trades", {
          profileId: profile.id,
        });
        setJournal(response.data);
        setPrivateProvenance(response.meta.provenance);
      } else if (next === "Watchlist") {
        const response = await bridge.callTool<MarketWatchlist[]>("get_market_watchlist", {
          profileId: profile.id,
        });
        setWatchlists(response.data);
        setPrivateProvenance(response.meta.provenance);
      } else if (next === "Paper trading") {
        const response = await bridge.callTool<PaperPortfolio>("get_paper_portfolio", {
          profileId: profile.id,
        });
        setPaper(response.data);
        setPrivateProvenance(response.meta.provenance);
      } else if (next === "Backtests" && selectedItemId !== undefined) {
        const response = await bridge.callTool<MarketBacktestResult>("backtest_ge_strategy", {
          itemId: selectedItemId,
          initialGp: 10_000_000,
          slippagePercent: 1,
          fillDelayDays: 1,
          maximumHoldingDays: 14,
          trainingFraction: 0.7,
        });
        setBacktest(response.data);
        setAnalysisProvenance(response.meta.provenance);
      } else if (next === "Data status") {
        const response = await bridge.callTool<Record<string, unknown>>(
          "get_market_data_status",
          {},
        );
        setDataStatus(response.data);
        setMarketProvenance(response.meta.provenance);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The market view could not be loaded");
    } finally {
      setBusy(false);
    }
  }

  async function saveHolding(event: FormEvent) {
    event.preventDefault();
    if (!Number.isSafeInteger(holdingItemId) || holdingItemId <= 0) {
      setError("Enter a positive Grand Exchange item ID.");
      return;
    }
    if (!Number.isSafeInteger(holdingQuantity) || holdingQuantity <= 0) {
      setError("Enter a positive whole-number holding quantity.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<PlayerHoldingsSnapshot>("upsert_player_holding", {
        profileId: profile.id,
        holding: {
          itemId: holdingItemId,
          quantity: holdingQuantity,
          ...(holdingCost.trim() === "" ? {} : { averageAcquisitionPrice: Number(holdingCost) }),
          ...(holdingNotes.trim() === "" ? {} : { notes: holdingNotes.trim() }),
        },
        ...(holdingCash.trim() === "" ? {} : { cashGp: Number(holdingCash) }),
        source: "manual",
      });
      setHoldings(response.data);
      setPrivateProvenance(response.meta.provenance);
      const portfolioResponse = await bridge.callTool<PortfolioSummary>("get_portfolio_summary", {
        profileId: profile.id,
      });
      setPortfolio(portfolioResponse.data);
      setAnalysisProvenance(portfolioResponse.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The holding could not be saved");
    } finally {
      setBusy(false);
    }
  }

  function editHolding(holding: PlayerHolding) {
    setHoldingItemId(holding.itemId);
    setHoldingQuantity(holding.quantity);
    setHoldingCost(
      holding.averageAcquisitionPrice === undefined ? "" : String(holding.averageAcquisitionPrice),
    );
    setHoldingNotes(holding.notes ?? "");
  }

  async function removeHolding(itemId: number) {
    if (holdings === null || holdings === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<PlayerHoldingsSnapshot>("replace_player_holdings", {
        profileId: profile.id,
        items: holdings.items.filter((holding) => holding.itemId !== itemId),
        ...(holdings.cashGp === undefined ? {} : { cashGp: holdings.cashGp }),
        source: "manual",
        confirmReplace: true,
      });
      setHoldings(response.data);
      setPrivateProvenance(response.meta.provenance);
      const portfolioResponse = await bridge.callTool<PortfolioSummary>("get_portfolio_summary", {
        profileId: profile.id,
      });
      setPortfolio(portfolioResponse.data);
      setAnalysisProvenance(portfolioResponse.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The holding could not be removed");
    } finally {
      setBusy(false);
    }
  }

  async function transferHoldings(action: "import" | "export") {
    setBusy(true);
    setError(undefined);
    try {
      if (action === "import") {
        const response = await bridge.callTool<PlayerHoldingsSnapshot>("import_player_holdings", {
          profileId: profile.id,
          format: holdingsFormat,
          content: holdingsTransfer,
          confirmReplace: true,
        });
        setHoldings(response.data);
        setPrivateProvenance(response.meta.provenance);
      } else {
        const response = await bridge.callTool<{ content: string }>("export_player_holdings", {
          profileId: profile.id,
          format: holdingsFormat,
        });
        setHoldingsTransfer(response.data.content);
        setPrivateProvenance(response.meta.provenance);
      }
      const portfolioResponse = await bridge.callTool<PortfolioSummary>("get_portfolio_summary", {
        profileId: profile.id,
      });
      setPortfolio(portfolioResponse.data);
      setAnalysisProvenance(portfolioResponse.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Holdings transfer failed");
    } finally {
      setBusy(false);
    }
  }

  async function recordTrade(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const recorded = await bridge.callTool<GeTradeRecord>("record_ge_trade", {
        profileId: profile.id,
        itemId: tradeItemId,
        side: tradeSide,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
        occurredAt: new Date().toISOString(),
        source: "manual",
      });
      setPrivateProvenance(recorded.meta.provenance);
      const journalResponse = await bridge.callTool<GeTradeRecord[]>("list_ge_trades", {
        profileId: profile.id,
      });
      setJournal(journalResponse.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trade could not be recorded");
    } finally {
      setBusy(false);
    }
  }

  async function recordPaperTrade(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await bridge.callTool<PaperPortfolio>("record_paper_trade", {
        profileId: profile.id,
        itemId: paperItemId,
        side: paperSide,
        quantity: paperQuantity,
        unitPrice: paperPrice,
      });
      setPaper(response.data);
      setPrivateProvenance(response.meta.provenance);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The paper trade could not be recorded");
    } finally {
      setBusy(false);
    }
  }

  async function createWatchlist(event: FormEvent) {
    event.preventDefault();
    const itemIds = watchlistItems
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
    setBusy(true);
    setError(undefined);
    try {
      const created = await bridge.callTool<MarketWatchlist>("create_market_watchlist", {
        profileId: profile.id,
        name: watchlistName,
        itemIds: [...new Set(itemIds)],
      });
      setPrivateProvenance(created.meta.provenance);
      const response = await bridge.callTool<MarketWatchlist[]>("get_market_watchlist", {
        profileId: profile.id,
      });
      setWatchlists(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The watchlist could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Guide-price intelligence"
        title="Grand Exchange"
        description="Search current guide prices and inspect descriptive history—never guaranteed trades."
        actions={
          <div className="tag-row">
            {marketProvenance === undefined ? null : (
              <DataOriginBadge
                origin={marketProvenance.origin}
                provider={marketProvenance.provider}
                timestamp={marketProvenance.timestamp}
              />
            )}
            {analysisProvenance === undefined ? null : (
              <DataOriginBadge
                origin={analysisProvenance.origin}
                provider={analysisProvenance.provider}
                timestamp={analysisProvenance.timestamp}
              />
            )}
            {privateProvenance === undefined ? null : (
              <DataOriginBadge
                origin={privateProvenance.origin}
                provider={privateProvenance.provider}
                timestamp={privateProvenance.timestamp}
              />
            )}
          </div>
        }
      />
      <div
        className="tab-list exchange-tabs"
        role="tablist"
        aria-label="Grand Exchange intelligence views"
      >
        {EXCHANGE_TABS.map((name) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "active" : ""}
            key={name}
            onClick={() => void loadTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <form className="exchange-search" onSubmit={search}>
        <Icon name="search" size={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search 7,000+ tradeable items…"
          aria-label="Search Grand Exchange items"
        />
        <button className="primary-button" type="submit" disabled={busy}>
          Search
        </button>
      </form>
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      {results.length > 0 ? (
        <section className="item-result-strip" aria-label="Item search results">
          {results.map((item) => (
            <button type="button" key={item.itemId} onClick={() => void select(item)}>
              <span className="item-orb">{item.name.slice(0, 1)}</span>
              <span>
                <strong>{item.name}</strong>
                <small>#{item.itemId}</small>
              </span>
              <b>{formatGp(item.currentPrice)}</b>
            </button>
          ))}
        </section>
      ) : null}
      {busy && summary === undefined ? <LoadingBlock label="Loading validated price data" /> : null}
      {tab === "Buy candidates" || tab === "Sell candidates" ? (
        scan.length === 0 ? (
          <EmptyState
            title={`No ${tab.toLocaleLowerCase("en-GB")}`}
            description="Search for a bounded set of items first. Missing or low-confidence data is never promoted into a candidate."
          />
        ) : (
          <section className="metrics-grid">
            {scan.map((candidate) => (
              <article className="surface-card" key={candidate.itemId}>
                <p className="eyebrow">{candidate.recommendation}</p>
                <h2>{candidate.itemName}</h2>
                <strong>{candidate.scores.overallOpportunity.score}/100 opportunity</strong>
                <p>{candidate.topReasons[0]}</p>
                {candidate.indicators === undefined ? (
                  <InlineAlert tone="warning">
                    Validated market history is insufficient.
                  </InlineAlert>
                ) : (
                  <dl className="diagnostic-list compact-list">
                    <div>
                      <dt>Guide price</dt>
                      <dd>{formatGp(candidate.indicators.currentGuidePrice)}</dd>
                    </div>
                    <div>
                      <dt>Trend / volatility</dt>
                      <dd>
                        {candidate.scores.trend.score}/100 /{" "}
                        {candidate.indicators.dailyReturnVolatilityPercent?.toFixed(2) ?? "?"}%
                      </dd>
                    </div>
                    <div>
                      <dt>Volume / buy limit</dt>
                      <dd>
                        {candidate.indicators.latestVolume === undefined
                          ? "Unknown"
                          : formatNumber(candidate.indicators.latestVolume)}
                        {" / "}
                        {candidate.indicators.buyLimit === undefined
                          ? "Unknown"
                          : formatNumber(candidate.indicators.buyLimit)}
                      </dd>
                    </div>
                    <div>
                      <dt>Source timestamp</dt>
                      <dd>{formatDate(candidate.indicators.historyTimestamp)}</dd>
                    </div>
                  </dl>
                )}
                {orderPlans[candidate.itemId] === undefined ? null : (
                  <dl className="diagnostic-list compact-list">
                    <div>
                      <dt>Entry estimate</dt>
                      <dd>
                        {formatGp(orderPlans[candidate.itemId]?.suggestedEntryZone.low)} to{" "}
                        {formatGp(orderPlans[candidate.itemId]?.suggestedEntryZone.high)}
                      </dd>
                    </div>
                    <div>
                      <dt>Profit-taking estimate</dt>
                      <dd>
                        {formatGp(orderPlans[candidate.itemId]?.suggestedProfitTakingZone.low)} to{" "}
                        {formatGp(orderPlans[candidate.itemId]?.suggestedProfitTakingZone.high)}
                      </dd>
                    </div>
                    <div>
                      <dt>Maximum quantity</dt>
                      <dd>
                        {formatNumber(orderPlans[candidate.itemId]?.maximumSuggestedQuantity)}
                      </dd>
                    </div>
                  </dl>
                )}
                <small>
                  {candidate.confidence}/100 confidence · {candidate.heldQuantity} recorded held
                </small>
                {candidate.warnings.map((warning) => (
                  <InlineAlert tone="warning" key={warning}>
                    {warning}
                  </InlineAlert>
                ))}
              </article>
            ))}
          </section>
        )
      ) : tab === "Portfolio" ? (
        portfolio === undefined ? (
          <LoadingBlock label="Loading local portfolio" />
        ) : (
          <>
            <section className="metrics-grid exchange-metrics">
              <MetricCard
                label="Guide value"
                value={formatGp(portfolio.guideValue)}
                detail="Estimated public guide value"
                accent="mint"
              />
              <MetricCard
                label="Known cost basis"
                value={formatGp(portfolio.knownCostBasis)}
                detail="User-entered acquisition prices"
                accent="gold"
              />
              <MetricCard
                label="Unrealised estimate"
                value={formatGp(portfolio.unrealisedGuideValueGainLoss)}
                detail="Not realised until manually recorded"
                accent="blue"
              />
              <MetricCard
                label="Concentration"
                value={`${portfolio.concentrationRiskPercent.toFixed(1)}%`}
                detail="Largest item allocation"
                accent="rose"
              />
            </section>
            <section className="content-grid two-thirds">
              <form className="surface-card planner-form" onSubmit={saveHolding}>
                <p className="eyebrow">User-entered local data</p>
                <h2>Add or replace one holding</h2>
                <div className="form-columns">
                  <label>
                    Item ID
                    <input
                      type="number"
                      min={1}
                      value={holdingItemId}
                      onChange={(event) => setHoldingItemId(event.currentTarget.valueAsNumber)}
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min={1}
                      value={holdingQuantity}
                      onChange={(event) => setHoldingQuantity(event.currentTarget.valueAsNumber)}
                    />
                  </label>
                  <label>
                    Average acquisition price
                    <input
                      inputMode="numeric"
                      value={holdingCost}
                      onChange={(event) => setHoldingCost(event.currentTarget.value)}
                      placeholder="Optional GP"
                    />
                  </label>
                  <label>
                    Confirmed cash
                    <input
                      inputMode="numeric"
                      value={holdingCash}
                      onChange={(event) => setHoldingCash(event.currentTarget.value)}
                      placeholder="Optional GP"
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      value={holdingNotes}
                      onChange={(event) => setHoldingNotes(event.currentTarget.value)}
                      placeholder="Optional local note"
                    />
                  </label>
                </div>
                <button className="primary-button" type="submit" disabled={busy}>
                  Save confirmed holding
                </button>
                <small>
                  This is private local data. Jagex does not expose your bank, inventory or active
                  offers through these public APIs.
                </small>
              </form>
              <section className="surface-card planner-form">
                <p className="eyebrow">CSV / JSON</p>
                <h2>Import or export holdings</h2>
                <label>
                  Format
                  <select
                    value={holdingsFormat}
                    onChange={(event) =>
                      setHoldingsFormat(event.currentTarget.value as "csv" | "json")
                    }
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>
                <label>
                  Transfer data
                  <textarea
                    rows={8}
                    value={holdingsTransfer}
                    onChange={(event) => setHoldingsTransfer(event.currentTarget.value)}
                    placeholder="Paste a complete holdings export here"
                  />
                </label>
                <div className="tag-row">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy || holdingsTransfer.trim() === ""}
                    onClick={() => void transferHoldings("import")}
                  >
                    Confirm and replace
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy || holdings === null}
                    onClick={() => void transferHoldings("export")}
                  >
                    Export current snapshot
                  </button>
                </div>
              </section>
            </section>
            <section className="surface-card">
              <h2>Latest confirmed snapshot</h2>
              {holdings === undefined ? (
                <LoadingBlock label="Loading confirmed holdings" />
              ) : holdings === null ? (
                <p>No holdings snapshot has been recorded.</p>
              ) : (
                <>
                  <p>
                    {holdings?.items.length ?? 0} item lines; captured{" "}
                    {formatDate(holdings?.capturedAt)}; source {holdings?.source}; confirmed cash{" "}
                    {holdings?.cashGp === undefined ? "not entered" : formatGp(holdings.cashGp)}
                  </p>
                  {holdings.items.length === 0 ? (
                    <p>No item holdings have been recorded.</p>
                  ) : (
                    <div className="shopping-table" aria-label="Editable confirmed holdings">
                      {holdings.items.map((holding) => (
                        <div className="shopping-row" key={holding.itemId}>
                          <span className="item-orb">#{holding.itemId}</span>
                          <div>
                            <strong>{formatNumber(holding.quantity)} held</strong>
                            <small>
                              Cost{" "}
                              {holding.averageAcquisitionPrice === undefined
                                ? "not entered"
                                : formatGp(holding.averageAcquisitionPrice)}
                              {holding.notes === undefined ? "" : `; ${holding.notes}`}
                            </small>
                          </div>
                          <div className="button-row">
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={busy}
                              onClick={() => editHolding(holding)}
                            >
                              Edit
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={busy}
                              onClick={() => void removeHolding(holding.itemId)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )
      ) : tab === "Trade journal" ? (
        <section className="content-grid two-thirds">
          <form className="surface-card planner-form" onSubmit={recordTrade}>
            <p className="eyebrow">Private local journal</p>
            <h2>Record a completed trade</h2>
            <div className="form-columns">
              <label>
                Item ID
                <input
                  type="number"
                  min={1}
                  value={tradeItemId}
                  onChange={(event) => setTradeItemId(event.currentTarget.valueAsNumber)}
                />
              </label>
              <label>
                Side
                <select
                  value={tradeSide}
                  onChange={(event) => setTradeSide(event.currentTarget.value as "buy" | "sell")}
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min={1}
                  value={tradeQuantity}
                  onChange={(event) => setTradeQuantity(event.currentTarget.valueAsNumber)}
                />
              </label>
              <label>
                Unit price
                <input
                  type="number"
                  min={0}
                  value={tradePrice}
                  onChange={(event) => setTradePrice(event.currentTarget.valueAsNumber)}
                />
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={busy}>
              Record manual trade
            </button>
            <small>No offer is placed, edited or cancelled.</small>
          </form>
          <section className="surface-card">
            <h2>Recorded trades</h2>
            {journal.length === 0 ? (
              <p>No trades have been recorded.</p>
            ) : (
              <div className="shopping-table">
                {journal.map((trade) => (
                  <div className="shopping-row" key={trade.id}>
                    <span className="item-orb">{trade.side === "buy" ? "B" : "S"}</span>
                    <div>
                      <strong>Item #{trade.itemId}</strong>
                      <small>
                        {formatDate(trade.occurredAt)}; {trade.source}
                      </small>
                    </div>
                    <b>
                      {formatNumber(trade.quantity)} at {formatGp(trade.unitPrice)}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : tab === "Paper trading" ? (
        paper === undefined ? (
          <LoadingBlock label="Loading paper portfolio" />
        ) : (
          <section className="content-grid two-thirds">
            <form className="surface-card planner-form" onSubmit={recordPaperTrade}>
              <p className="eyebrow">Hypothetical only</p>
              <h2>Record a paper trade</h2>
              <div className="form-columns">
                <label>
                  Item ID
                  <input
                    type="number"
                    min={1}
                    value={paperItemId}
                    onChange={(event) => setPaperItemId(event.currentTarget.valueAsNumber)}
                  />
                </label>
                <label>
                  Side
                  <select
                    value={paperSide}
                    onChange={(event) => setPaperSide(event.currentTarget.value as "buy" | "sell")}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={paperQuantity}
                    onChange={(event) => setPaperQuantity(event.currentTarget.valueAsNumber)}
                  />
                </label>
                <label>
                  Unit price
                  <input
                    type="number"
                    min={0}
                    value={paperPrice}
                    onChange={(event) => setPaperPrice(event.currentTarget.valueAsNumber)}
                  />
                </label>
              </div>
              <button className="primary-button" type="submit" disabled={busy}>
                Record hypothetical trade
              </button>
            </form>
            <section className="surface-card">
              <p className="eyebrow">Paper portfolio</p>
              <h2>{formatGp(paper.cashGp)} simulated cash</h2>
              <p>
                {paper.holdings.length} simulated holdings · {paper.trades.length} paper trades
              </p>
              <InlineAlert tone="info">{paper.disclaimer}</InlineAlert>
            </section>
          </section>
        )
      ) : tab === "Backtests" ? (
        selectedItemId === undefined ? (
          <EmptyState
            title="Select an item first"
            description="Backtests require validated historical guide prices for a selected item."
          />
        ) : backtest === undefined ? (
          <LoadingBlock label="Running chronological backtest" />
        ) : (
          <>
            <section className="metrics-grid exchange-metrics">
              <MetricCard
                label="Signals"
                value={formatNumber(backtest.signalCount)}
                detail={`${backtest.completedTradeCount} simulated trades`}
                accent="mint"
              />
              <MetricCard
                label="Hit rate"
                value={`${backtest.hitRatePercent.toFixed(1)}%`}
                detail="Evaluation period only"
                accent="gold"
              />
              <MetricCard
                label="Mean return"
                value={`${backtest.meanReturnPercent.toFixed(2)}%`}
                detail="After assumed slippage"
                accent="blue"
              />
              <MetricCard
                label="Max drawdown"
                value={`${backtest.maximumDrawdownPercent.toFixed(2)}%`}
                detail="Hypothetical evaluation"
                accent="rose"
              />
            </section>
            <section className="surface-card">
              <h2>Walk-forward evaluation</h2>
              <p>
                {formatNumber(backtest.walkForwardWindowCount)} sequential expanding-history
                windows; {formatNumber(backtest.insufficientDataCount)} unavailable/failed fills.
              </p>
              <div className="shopping-table">
                {backtest.resultsByConfidenceBand.map((result) => (
                  <div className="shopping-row" key={result.band}>
                    <span className="item-orb">{result.band.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{titleCase(result.band)} confidence</strong>
                      <small>
                        {formatNumber(result.signalCount)} signals;{" "}
                        {formatNumber(result.completedTradeCount)}
                        completed trades
                      </small>
                    </div>
                    <b>
                      {result.hitRatePercent.toFixed(1)}% hit /{" "}
                      {result.meanReturnPercent.toFixed(2)}% mean
                    </b>
                  </div>
                ))}
              </div>
              <InlineAlert tone="info">{backtest.disclaimer}</InlineAlert>
            </section>
          </>
        )
      ) : tab === "Data status" ? (
        dataStatus === undefined ? (
          <LoadingBlock label="Loading market source status" />
        ) : (
          <section className="surface-card">
            <h2>Market data status</h2>
            <pre>{JSON.stringify(dataStatus, null, 2)}</pre>
          </section>
        )
      ) : tab === "Watchlist" ? (
        <section className="content-grid two-thirds">
          <form className="surface-card planner-form" onSubmit={createWatchlist}>
            <p className="eyebrow">Private local data</p>
            <h2>Create a watchlist</h2>
            <label>
              Name
              <input
                value={watchlistName}
                onChange={(event) => setWatchlistName(event.currentTarget.value)}
              />
            </label>
            <label>
              Item IDs
              <input
                value={watchlistItems}
                onChange={(event) => setWatchlistItems(event.currentTarget.value)}
                placeholder="4151, 2363, 453"
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy}>
              Save watchlist
            </button>
          </form>
          <section className="surface-card">
            <h2>Saved watchlists</h2>
            {watchlists.length === 0 ? (
              <p>No watchlists have been recorded.</p>
            ) : (
              <div className="shopping-table">
                {watchlists.map((watchlist) => (
                  <div className="shopping-row" key={watchlist.id}>
                    <span className="item-orb">W</span>
                    <div>
                      <strong>{watchlist.name}</strong>
                      <small>{watchlist.itemIds.join(", ") || "No items"}</small>
                    </div>
                    <b>{watchlist.itemIds.length} items</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : summary === undefined ? (
        <EmptyState
          title="Search for an item"
          description="See current guide value, recent change, moving averages, volatility and source freshness."
        />
      ) : (
        <>
          <section className="surface-card exchange-hero">
            <div className="item-heading">
              <span className="item-orb large">{summary.name.slice(0, 1)}</span>
              <div>
                <p className="eyebrow">Item #{summary.itemId}</p>
                <h2>{summary.name}</h2>
              </div>
            </div>
            <div className="current-price">
              <span>Current guide price</span>
              <strong>{formatGp(summary.currentPrice)}</strong>
              <StatusPill state={(summary.percentageChange ?? 0) >= 0 ? "success" : "warning"}>
                {(summary.percentageChange ?? 0) >= 0 ? "+" : ""}
                {summary.percentageChange?.toFixed(2) ?? "?"}% / {summary.range}
              </StatusPill>
            </div>
          </section>
          {analysis === undefined ? null : (
            <section className="surface-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Deterministic signal</p>
                  <h2>{titleCase(analysis.recommendation.replaceAll("-", " "))}</h2>
                </div>
                <StatusPill state={analysis.confidence >= 70 ? "success" : "warning"}>
                  {analysis.confidence}/100 confidence
                </StatusPill>
              </div>
              <p>{analysis.topReasons.join(" ")}</p>
              <div className="tag-row">
                <span>Opportunity {analysis.scores.overallOpportunity.score}/100</span>
                <span>Trend {analysis.scores.trend.score}/100</span>
                <span>Risk {analysis.scores.volatilityRisk.score}/100</span>
                <span>Liquidity {analysis.scores.liquidity.score}/100</span>
              </div>
              {analysis.warnings.map((warning) => (
                <InlineAlert tone="warning" key={warning}>
                  {warning}
                </InlineAlert>
              ))}
            </section>
          )}
          <section className="metrics-grid exchange-metrics">
            <MetricCard
              label="30-point average"
              value={formatGp(summary.movingAverages.days30)}
              detail="Arithmetic mean"
              accent="mint"
            />
            <MetricCard
              label="Range high"
              value={formatGp(summary.historicalHigh)}
              detail={`${summary.range} guide high`}
              accent="gold"
            />
            <MetricCard
              label="Range low"
              value={formatGp(summary.historicalLow)}
              detail={`${summary.range} guide low`}
              accent="blue"
            />
            <MetricCard
              label="Daily volatility"
              value={
                summary.volatilityPercent === undefined
                  ? "Unknown"
                  : `${summary.volatilityPercent.toFixed(2)}%`
              }
              detail="Standard deviation of returns"
              accent="rose"
            />
          </section>
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Chart-ready history</p>
                <h2>{summary.range} guide-price movement</h2>
              </div>
              <StatusPill state={summary.historyFreshness.state === "fresh" ? "fresh" : "stale"}>
                {titleCase(summary.historyFreshness.state)}
              </StatusPill>
            </div>
            <PriceChart summary={summary} />
          </section>
          <InlineAlert tone="info">
            RS3 public sources do not provide an instant order book. Buy/high and sell/low prices
            stay explicitly unavailable; this chart is not a profit forecast.
          </InlineAlert>
        </>
      )}
    </div>
  );
}

export function ShoppingListsView({ bridge }: { bridge: CompanionBridge }) {
  const [name, setName] = useState("Coal");
  const [quantity, setQuantity] = useState(1_000);
  const [lines, setLines] = useState<Array<{ item: string; quantity: number }>>([]);
  const [valuation, setValuation] = useState<Valuation>();
  const [error, setError] = useState<string>();

  function addLine(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
      setError("Enter an item name and a positive whole-number quantity.");
      return;
    }
    setLines((current) => [...current, { item: name.trim(), quantity }]);
    setName("");
    setQuantity(1);
    setError(undefined);
  }

  async function valueList() {
    setError(undefined);
    try {
      const result = await bridge.callTool<Valuation>("value_item_list", { items: lines });
      setValuation(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The list could not be valued");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Local lists"
        title="Shopping lists"
        description="Build a list, aggregate duplicate items and value it with explicit missing-price lines."
      />
      {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}
      <div className="content-grid two-thirds">
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current list</p>
              <h2>Materials to gather</h2>
            </div>
            <StatusPill state="neutral">{lines.length} lines</StatusPill>
          </div>
          <form className="inline-add-form" onSubmit={addLine}>
            <label>
              <span className="sr-only">Item name</span>
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Item name"
              />
            </label>
            <label>
              <span className="sr-only">Quantity</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.currentTarget.valueAsNumber)}
              />
            </label>
            <button className="secondary-button" type="submit">
              <Icon name="plus" />
              Add
            </button>
          </form>
          {lines.length === 0 ? (
            <EmptyState
              title="Your list is empty"
              description="Add materials by name; exact catalogue aliases are resolved when you value it."
            />
          ) : (
            <div className="shopping-table">
              {lines.map((line, index) => (
                <div className="shopping-row" key={`${line.item}-${index}`}>
                  <span className="item-orb">{line.item.slice(0, 1)}</span>
                  <div>
                    <strong>{line.item}</strong>
                    <small>Pending catalogue resolution</small>
                  </div>
                  <b>× {formatNumber(line.quantity)}</b>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Remove ${line.item}`}
                    onClick={() => setLines((current) => current.filter((_, row) => row !== index))}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className="primary-button wide"
            type="button"
            disabled={lines.length === 0}
            onClick={() => void valueList()}
          >
            <Icon name="exchange" />
            Value current list
          </button>
        </section>
        <aside className="surface-card sticky-card">
          <p className="eyebrow">Guide-price valuation</p>
          <h2>{valuation === undefined ? "Not calculated" : formatGp(valuation.totalValue)}</h2>
          {valuation === undefined ? (
            <p className="muted-copy">
              Valuation is read-only and never places a Grand Exchange offer.
            </p>
          ) : (
            <>
              <StatusPill state={valuation.complete ? "success" : "warning"}>
                {valuation.complete ? "Complete" : "Some prices missing"}
              </StatusPill>
              <div className="valuation-lines">
                {valuation.items.map((line) => (
                  <div key={`${line.itemId ?? line.name}`}>
                    <span>{line.name}</span>
                    <strong>{formatGp(line.totalPrice)}</strong>
                  </div>
                ))}
              </div>
              <small>Guide values only. Actual transactions may differ.</small>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export function GoalsView({
  goals,
  onAdd,
  onToggle,
  onRemove,
}: {
  goals: LocalGoal[];
  onAdd: (goal: LocalGoal) => void;
  onToggle: (goalId: string) => void;
  onRemove: (goalId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const remaining = useMemo(() => goals.filter((goal) => !goal.completed).length, [goals]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2 || target.trim().length < 1) {
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      target: target.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    });
    setTitle("");
    setTarget("");
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Personal planning"
        title="Goals"
        description="Small, local commitments that remain useful with no AI and no network."
        actions={<StatusPill state="neutral">{remaining} active</StatusPill>}
      />
      <div className="content-grid two-thirds">
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Goal board</p>
              <h2>Your next milestones</h2>
            </div>
          </div>
          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              description="Add a level, quest, item or custom milestone."
            />
          ) : (
            <div className="goal-list">
              {goals.map((goal) => (
                <article
                  className={goal.completed ? "goal-row completed" : "goal-row"}
                  key={goal.id}
                >
                  <button
                    className="goal-check"
                    type="button"
                    aria-label={goal.completed ? `Reopen ${goal.title}` : `Complete ${goal.title}`}
                    onClick={() => onToggle(goal.id)}
                  >
                    {goal.completed ? <Icon name="check" /> : null}
                  </button>
                  <div>
                    <strong>{goal.title}</strong>
                    <span>{goal.target}</span>
                  </div>
                  <time dateTime={goal.createdAt}>{formatDate(goal.createdAt)}</time>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Remove ${goal.title}`}
                    onClick={() => onRemove(goal.id)}
                  >
                    <Icon name="trash" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        <aside className="surface-card sticky-card">
          <p className="eyebrow">Add a goal</p>
          <h2>What comes next?</h2>
          <form className="stacked-form" onSubmit={submit}>
            <label>
              Goal
              <input
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Reach 99 Herblore"
              />
            </label>
            <label>
              Target or note
              <input
                value={target}
                onChange={(event) => setTarget(event.currentTarget.value)}
                placeholder="13,034,431 XP"
              />
            </label>
            <button className="primary-button wide" type="submit">
              <Icon name="plus" />
              Add local goal
            </button>
          </form>
          <small>Goals are stored in this app's local webview storage.</small>
        </aside>
      </div>
    </div>
  );
}
