import { CompanionError } from "@gielinor/core";
import type { CompanionToolService } from "@gielinor/mcp-server/library";

export type HostedActor =
  | { kind: "anonymous"; rateLimitKey: string }
  | { kind: "account"; accountId: string; rateLimitKey: string }
  | { kind: "operator"; rateLimitKey: string };

const PROFILE_METHODS = new Set<keyof CompanionToolService>([
  "createPlayerProfile",
  "getPlayerProfile",
  "listPlayerProfiles",
  "refreshPlayerStats",
  "updatePlayerPreferences",
  "exportPlayerProfile",
  "importPlayerProfile",
  "getSkillProgress",
  "calculateQuestShoppingCost",
  "setQuestStatus",
  "setMultipleQuestStatuses",
  "listAvailableQuests",
  "listMissingQuestRequirements",
  "createQuestRoute",
  "createQuestShoppingList",
  "compareTrainingMethods",
  "createLevellingPlan",
  "createWeeklyGoalPlan",
  "estimateTimeToLevel",
  "estimateCostToLevel",
  "calculateTrainingCost",
  "getSelectedPlayerSnapshot",
  "setSelectedPlayerProfile",
  "getPlayerHoldings",
  "replacePlayerHoldings",
  "upsertPlayerHolding",
  "importPlayerHoldings",
  "exportPlayerHoldings",
  "recordGeTrade",
  "listGeTrades",
  "updateGeTrade",
  "removeGeTrade",
  "getMarketPreferences",
  "updateMarketPreferences",
  "createMarketWatchlist",
  "updateMarketWatchlist",
  "getMarketWatchlist",
  "analyseGeItem",
  "scanGeOpportunities",
  "getGeBuyCandidates",
  "getGeSellCandidates",
  "createManualGeOrderPlan",
  "backtestGeStrategy",
  "getPortfolioSummary",
  "getRealDataStatus",
  "getProviderDisagreements",
  "getPaperPortfolio",
  "recordPaperTrade",
]);

const OPERATOR_METHODS = new Set<keyof CompanionToolService>([
  "refreshPriceData",
  "refreshQuestData",
  "refreshTrainingData",
  "getSystemHealth",
  "getProviderHealth",
  "getCatalogueHealth",
  "listRecentErrors",
  "listRecoveryEvents",
  "retryFailedOperation",
  "refreshStaleCatalogues",
  "runDatabaseIntegrityCheck",
  "exportRedactedDiagnostics",
  "checkForSoftwareUpdates",
  "clearExpiredQuarantineRecords",
  "resetProviderCircuit",
  "refreshAllRealData",
  "refreshMarketData",
  "setOfflineMode",
]);

function authorize(
  actor: HostedActor,
  method: keyof CompanionToolService,
  argumentsList: unknown[],
): void {
  if (PROFILE_METHODS.has(method) && actor.kind !== "account") {
    throw new CompanionError(
      "Authentication is required for private player profile tools",
      "AUTH_REQUIRED",
    );
  }
  if (OPERATOR_METHODS.has(method) && actor.kind !== "operator") {
    throw new CompanionError(
      "This shared-data maintenance tool is restricted to the service operator",
      "OPERATOR_REQUIRED",
    );
  }
  if (
    method === "compareQuestXpRewards" &&
    argumentsList[1] !== undefined &&
    actor.kind !== "account"
  ) {
    throw new CompanionError(
      "Authentication is required when comparing rewards against a private profile",
      "AUTH_REQUIRED",
    );
  }
}

export function restrictToolService(
  tools: CompanionToolService,
  actor: HostedActor,
): CompanionToolService {
  return new Proxy(tools, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof property !== "string" || typeof value !== "function") {
        return value;
      }
      return (...argumentsList: unknown[]) => {
        authorize(actor, property as keyof CompanionToolService, argumentsList);
        return Reflect.apply(value, target, argumentsList) as unknown;
      };
    },
  });
}
