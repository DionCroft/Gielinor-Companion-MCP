import { unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  CompanionError,
  GrandExchangeService,
  LevellingPlannerService,
  PlayerPrivateDataService,
  MarketIntelligenceService,
  ProfileService,
  QuestService,
  type GrandExchangeDataProvider,
  type PlayerProfileRepository,
  type PlayerStatsProvider,
  type QuestDataProvider,
  type TrainingMethodProvider,
  type MarketHistoryProvider,
  type RuneScapeNewsProvider,
} from "@gielinor/core";
import {
  openResilientDatabase,
  SqliteCacheStore,
  SqliteDiagnosticsRepository,
  SqlitePlayerProfileRepository,
  SqlitePlayerPrivateDataRepository,
  SqlitePriceRepository,
  SqliteQuestRepository,
  SqliteTrainingMethodRepository,
  type DatabaseConnection,
  type DatabaseRecoveryState,
  type ResilientDatabase,
} from "@gielinor/database";
import {
  CompanionToolService,
  createCatalogueMaintenanceRuntime,
  loadMaintenanceRuntimePolicy,
  OfflineModeController,
  RuntimeDiagnosticsService,
  SoftwareUpdateService,
  softwareUpdateChecksEnabled,
  type CatalogueMaintenanceRuntime,
  type MaintenanceRuntimePolicy,
} from "@gielinor/mcp-server/library";
import {
  createDefaultProviderStack,
  loadProviderConfig,
  type ProviderHealth,
  type ProviderRegistry,
} from "@gielinor/providers";
import {
  APPLICATION_VERSION,
  PlayerProfileSchema,
  toGielinorError,
  type GielinorError,
  type PlayerProfile,
} from "@gielinor/shared-types";
import { z } from "zod";

import { HostedAccountImportSchema, type HostedAccountExport } from "./account-transfer.js";
import type { HostedConfig } from "./config.js";
import { restrictToolService, type HostedActor } from "./tool-access.js";

const AccountIdSchema = z.string().uuid();

class UnavailableProfileRepository implements PlayerProfileRepository {
  private unavailable(): CompanionError {
    return new CompanionError(
      "Authentication is required for private player profile tools",
      "AUTH_REQUIRED",
    );
  }

  public create(): Promise<PlayerProfile> {
    return Promise.reject(this.unavailable());
  }

  public getById(): Promise<PlayerProfile | null> {
    return Promise.reject(this.unavailable());
  }

  public list(): Promise<PlayerProfile[]> {
    return Promise.reject(this.unavailable());
  }

  public save(): Promise<PlayerProfile> {
    return Promise.reject(this.unavailable());
  }
}

export type HostedToolSession = {
  tools: CompanionToolService;
  profiles: ProfileService;
  diagnostics?: RuntimeDiagnosticsService;
  databaseRecovery?: DatabaseRecoveryState;
  close(): void;
};

export type HostedReadiness = {
  storage: "ready" | "safe-mode";
  datasets: {
    quests: string;
    training: string;
    prices: string;
  };
  providers: ProviderHealth[];
};

export class HostedServiceFactory {
  private readonly publicDatabaseRuntime: ResilientDatabase;
  private readonly publicDatabase: DatabaseConnection;
  private readonly cacheStore: SqliteCacheStore;
  private readonly providerRegistry: ProviderRegistry;
  private readonly statsProvider: PlayerStatsProvider;
  private readonly priceProvider: GrandExchangeDataProvider;
  private readonly questRepository: SqliteQuestRepository;
  private readonly trainingRepository: SqliteTrainingMethodRepository;
  private readonly priceRepository: SqlitePriceRepository;
  private readonly questProvider: QuestDataProvider;
  private readonly trainingProvider: TrainingMethodProvider;
  private readonly marketHistoryProvider: MarketHistoryProvider;
  private readonly comparisonHistoryProvider: MarketHistoryProvider;
  private readonly newsProvider: RuneScapeNewsProvider;
  private readonly offlineMode: OfflineModeController;
  private readonly maintenancePolicy: MaintenanceRuntimePolicy;
  private readonly diagnosticsRepository: SqliteDiagnosticsRepository | undefined;
  private readonly maintenanceQuests: QuestService;
  private readonly maintenancePlanner: LevellingPlannerService;
  private readonly maintenanceExchange: GrandExchangeService;
  private readonly updateChecker: SoftwareUpdateService;
  private maintenance: CatalogueMaintenanceRuntime | undefined;
  private diagnostics: RuntimeDiagnosticsService | undefined;
  private maintenanceStarting: Promise<void> | undefined;
  private maintenanceStartupError: GielinorError | undefined;

  public constructor(
    private readonly config: HostedConfig,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    const providerConfig = loadProviderConfig({
      ...environment,
      GIELINOR_USER_AGENT: config.userAgent,
    });
    this.maintenancePolicy = loadMaintenanceRuntimePolicy({
      ...environment,
      GIELINOR_MAINTENANCE_ENABLED: String(config.maintenanceEnabled),
    });
    this.publicDatabaseRuntime = openResilientDatabase(config.publicDatabasePath);
    this.publicDatabase = this.publicDatabaseRuntime.database;
    this.cacheStore = new SqliteCacheStore(this.publicDatabase);
    this.offlineMode = new OfflineModeController(this.publicDatabase, providerConfig.offline);
    const providers = createDefaultProviderStack(providerConfig, this.cacheStore, () =>
      this.offlineMode.isOffline(),
    );
    this.providerRegistry = providers.registry;
    this.statsProvider = providers.ports;
    this.priceProvider = providers.ports;
    this.questRepository = new SqliteQuestRepository(this.publicDatabase);
    this.trainingRepository = new SqliteTrainingMethodRepository(this.publicDatabase);
    this.priceRepository = new SqlitePriceRepository(this.publicDatabase);
    this.questProvider = providers.ports.quests;
    this.trainingProvider = providers.ports.training;
    this.marketHistoryProvider = providers.marketHistory;
    this.comparisonHistoryProvider = providers.jagexMarketHistory;
    this.newsProvider = providers.news;
    this.diagnosticsRepository =
      this.publicDatabaseRuntime.state.status === "safe-mode"
        ? undefined
        : new SqliteDiagnosticsRepository(this.publicDatabase);
    const unavailableProfiles = new ProfileService(
      new UnavailableProfileRepository(),
      this.statsProvider,
    );
    this.maintenanceQuests = new QuestService(
      this.questRepository,
      unavailableProfiles,
      this.questProvider,
    );
    this.maintenancePlanner = new LevellingPlannerService(
      this.trainingRepository,
      unavailableProfiles,
      this.maintenanceQuests,
      this.trainingProvider,
    );
    this.maintenanceExchange = new GrandExchangeService(
      this.priceRepository,
      this.priceProvider,
      this.maintenanceQuests,
      this.maintenancePlanner,
    );
    this.updateChecker = new SoftwareUpdateService({
      installedVersion: APPLICATION_VERSION,
      cacheStore: this.cacheStore,
      userAgent: config.userAgent,
      offline: () => this.offlineMode.isOffline(),
      enabled: softwareUpdateChecksEnabled(environment),
      checkIntervalMs: this.maintenancePolicy.intervals["software-update-check"],
    });
  }

  public createSession(actor: HostedActor): HostedToolSession {
    let accountDatabaseRuntime: ResilientDatabase | undefined;
    const profileRepository =
      actor.kind === "account"
        ? (() => {
            accountDatabaseRuntime = openResilientDatabase(
              this.accountDatabasePath(actor.accountId),
            );
            return new SqlitePlayerProfileRepository(accountDatabaseRuntime.database);
          })()
        : new UnavailableProfileRepository();
    const profiles = new ProfileService(profileRepository, this.statsProvider);
    const playerPrivateData =
      accountDatabaseRuntime === undefined
        ? undefined
        : new PlayerPrivateDataService(
            new SqlitePlayerPrivateDataRepository(accountDatabaseRuntime.database),
            profileRepository,
          );
    const quests = new QuestService(this.questRepository, profiles, this.questProvider);
    const planner = new LevellingPlannerService(
      this.trainingRepository,
      profiles,
      quests,
      this.trainingProvider,
    );
    const exchange = new GrandExchangeService(
      this.priceRepository,
      this.priceProvider,
      quests,
      planner,
    );
    const marketIntelligence =
      playerPrivateData === undefined
        ? undefined
        : new MarketIntelligenceService(
            this.priceRepository,
            this.marketHistoryProvider,
            playerPrivateData,
            Date.now,
            this.newsProvider,
            this.comparisonHistoryProvider,
          );
    const tools = restrictToolService(
      new CompanionToolService(
        profiles,
        this.priceProvider,
        quests,
        planner,
        exchange,
        this.diagnostics,
        playerPrivateData,
        marketIntelligence,
        this.offlineMode,
        "hosted-real",
      ),
      actor,
    );

    return {
      tools,
      profiles,
      ...(this.diagnostics === undefined ? {} : { diagnostics: this.diagnostics }),
      ...(accountDatabaseRuntime === undefined
        ? {}
        : { databaseRecovery: accountDatabaseRuntime.state }),
      close: () => {
        accountDatabaseRuntime?.close();
      },
    };
  }

  public async exportAccount(accountId: string): Promise<HostedAccountExport> {
    const session = this.createSession({
      kind: "account",
      accountId,
      rateLimitKey: "account-export",
    });
    try {
      const profiles = await session.profiles.list();
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        profiles: await Promise.all(profiles.map((profile) => session.profiles.export(profile.id))),
      };
    } finally {
      session.close();
    }
  }

  public async importAccount(
    accountId: string,
    payload: unknown,
  ): Promise<{ importedProfileIds: string[] }> {
    const imported = HostedAccountImportSchema.parse(payload);
    const session = this.createSession({
      kind: "account",
      accountId,
      rateLimitKey: "account-import",
    });
    try {
      const profiles = [];
      for (const profile of imported.profiles) {
        profiles.push(PlayerProfileSchema.parse(await session.profiles.import(profile)));
      }
      return { importedProfileIds: profiles.map((profile) => profile.id) };
    } finally {
      session.close();
    }
  }

  public deleteAccountData(accountId: string): void {
    const databasePath = this.accountDatabasePath(accountId);
    for (const filename of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      try {
        unlinkSync(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  public async readiness(): Promise<HostedReadiness> {
    const databaseCheck = this.publicDatabase.pragma("quick_check", { simple: true });
    if (databaseCheck !== "ok") {
      throw new Error("Public data storage is unavailable");
    }
    const [quests, training, prices] = await Promise.all([
      this.questRepository.getDataStatus(),
      this.trainingRepository.getDataStatus(),
      this.priceRepository.getDataStatus(),
    ]);
    return {
      storage: this.publicDatabaseRuntime.state.status === "safe-mode" ? "safe-mode" : "ready",
      datasets: {
        quests: quests.state,
        training: training.state,
        prices: prices.state,
      },
      providers: this.providerRegistry.health.snapshot(),
    };
  }

  public startMaintenance(): Promise<void> {
    if (
      !this.config.maintenanceEnabled ||
      this.publicDatabaseRuntime.state.status === "safe-mode"
    ) {
      this.ensureDiagnostics();
      return Promise.resolve();
    }
    if (this.maintenanceStarting !== undefined) {
      return this.maintenanceStarting;
    }
    this.maintenanceStarting = createCatalogueMaintenanceRuntime({
      database: this.publicDatabase,
      quests: this.maintenanceQuests,
      planner: this.maintenancePlanner,
      exchange: this.maintenanceExchange,
      offline: () => this.offlineMode.isOffline(),
      policy: this.maintenancePolicy,
      diagnostics: this.diagnosticsRepository,
      updateChecker: this.updateChecker,
    })
      .then((runtime) => {
        this.maintenance = runtime;
        runtime.start();
        this.ensureDiagnostics();
      })
      .catch((error: unknown) => {
        this.maintenanceStartupError = toGielinorError(error, {
          fallbackCode: "GC-SCHED-001",
          source: "hosted-server",
          operation: "maintenance-startup",
        });
        this.diagnosticsRepository?.recordError(this.maintenanceStartupError);
        this.ensureDiagnostics();
      });
    return this.maintenanceStarting;
  }

  public async close(): Promise<void> {
    await this.maintenanceStarting;
    await this.maintenance?.stop();
    this.publicDatabaseRuntime.close();
  }

  private accountDatabasePath(accountId: string): string {
    const validated = AccountIdSchema.parse(accountId);
    const path = resolve(this.config.accountDirectory, `${validated}.db`);
    if (dirname(path) !== resolve(this.config.accountDirectory)) {
      throw new Error("Invalid account storage path");
    }
    return path;
  }

  private ensureDiagnostics(): void {
    this.diagnostics ??= new RuntimeDiagnosticsService({
      database: this.publicDatabase,
      databaseRecovery: this.publicDatabaseRuntime.state,
      providerRegistry: this.providerRegistry,
      cacheStore: this.cacheStore,
      quests: this.maintenanceQuests,
      planner: this.maintenancePlanner,
      exchange: this.maintenanceExchange,
      maintenance: this.maintenance,
      maintenancePolicy: this.maintenancePolicy,
      updateChecker: this.updateChecker,
      offline: () => this.offlineMode.isOffline(),
      repository: this.diagnosticsRepository,
      configuration: {
        accountCreationEnabled: this.config.accountCreationEnabled,
        requireHttps: this.config.requireHttps,
        trustProxy: this.config.trustProxy,
      },
    });
  }
}
