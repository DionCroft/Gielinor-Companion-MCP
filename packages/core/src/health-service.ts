import {
  SystemHealthSchema,
  type ComponentHealthState,
  type SystemHealth,
  type SystemHealthOverall,
} from "@gielinor/shared-types";

export type SystemHealthSnapshot = Omit<SystemHealth, "overall" | "checkedAt"> & {
  offline: boolean;
};

export interface SystemHealthSource {
  snapshot(): Promise<SystemHealthSnapshot>;
}

function hasState(
  snapshot: SystemHealthSnapshot,
  states: ReadonlySet<ComponentHealthState>,
): boolean {
  return (
    states.has(snapshot.database.state) ||
    states.has(snapshot.scheduler.state) ||
    states.has(snapshot.updateChecker.state)
  );
}

export function determineOverallHealth(snapshot: SystemHealthSnapshot): SystemHealthOverall {
  const aiProviders = snapshot.aiProviders ?? [];
  if (snapshot.database.state === "safe-mode") {
    return "safe-mode";
  }
  const missingCoreCatalogue = snapshot.catalogues.some(
    (catalogue) =>
      (catalogue.state === "missing" || catalogue.state === "failed") &&
      catalogue.recordCount === 0,
  );
  if (
    missingCoreCatalogue ||
    hasState(snapshot, new Set<ComponentHealthState>(["critical"])) ||
    (snapshot.providers.some((provider) => provider.state === "unavailable") &&
      snapshot.catalogues.every((catalogue) => catalogue.recordCount === 0))
  ) {
    return "critical";
  }
  if (snapshot.offline) {
    return "offline";
  }
  if (
    hasState(snapshot, new Set<ComponentHealthState>(["recovering"])) ||
    snapshot.catalogues.some((catalogue) => catalogue.state === "refreshing") ||
    snapshot.providers.some((provider) => provider.circuitState === "half-open") ||
    aiProviders.some((provider) => provider.circuitState === "half-open")
  ) {
    return "recovering";
  }
  if (
    hasState(snapshot, new Set<ComponentHealthState>(["degraded", "unknown"])) ||
    snapshot.catalogues.some((catalogue) => catalogue.state === "stale") ||
    snapshot.providers.some(
      (provider) =>
        provider.state === "degraded" ||
        provider.state === "unavailable" ||
        provider.circuitState === "open",
    ) ||
    aiProviders.some(
      (provider) =>
        provider.state === "degraded" ||
        provider.state === "unavailable" ||
        provider.circuitState === "open",
    ) ||
    snapshot.activeErrors.length > 0
  ) {
    return "degraded";
  }
  return "healthy";
}

export class SystemHealthService {
  public constructor(
    private readonly source: SystemHealthSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getHealth(): Promise<SystemHealth> {
    const snapshot = await this.source.snapshot();
    const health: Omit<SystemHealthSnapshot, "offline"> = {
      database: snapshot.database,
      providers: snapshot.providers,
      catalogues: snapshot.catalogues,
      scheduler: snapshot.scheduler,
      updateChecker: snapshot.updateChecker,
      ...(snapshot.aiProviders === undefined ? {} : { aiProviders: snapshot.aiProviders }),
      activeErrors: snapshot.activeErrors,
      recentRecoveries: snapshot.recentRecoveries,
    };
    return SystemHealthSchema.parse({
      ...health,
      overall: determineOverallHealth(snapshot),
      checkedAt: this.now().toISOString(),
    });
  }
}
