import { unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  CompanionError,
  GrandExchangeService,
  LevellingPlannerService,
  ProfileService,
  QuestService,
  type GrandExchangeDataProvider,
  type PlayerProfileRepository,
  type PlayerStatsProvider,
  type QuestDataProvider,
  type TrainingMethodProvider,
} from "@gielinor/core";
import {
  openDatabase,
  SqliteCacheStore,
  SqlitePlayerProfileRepository,
  SqlitePriceRepository,
  SqliteQuestRepository,
  SqliteTrainingMethodRepository,
  type DatabaseConnection,
} from "@gielinor/database";
import { CompanionToolService } from "@gielinor/mcp-server/library";
import {
  createDefaultProviderStack,
  loadProviderConfig,
  type ProviderHealth,
  type ProviderRegistry,
} from "@gielinor/providers";
import { PlayerProfileSchema, type PlayerProfile } from "@gielinor/shared-types";
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
  close(): void;
};

export type HostedReadiness = {
  storage: "ready";
  datasets: {
    quests: string;
    training: string;
    prices: string;
  };
  providers: ProviderHealth[];
};

export class HostedServiceFactory {
  private readonly publicDatabase: DatabaseConnection;
  private readonly providerRegistry: ProviderRegistry;
  private readonly statsProvider: PlayerStatsProvider;
  private readonly priceProvider: GrandExchangeDataProvider;
  private readonly questRepository: SqliteQuestRepository;
  private readonly trainingRepository: SqliteTrainingMethodRepository;
  private readonly priceRepository: SqlitePriceRepository;
  private readonly questProvider: QuestDataProvider;
  private readonly trainingProvider: TrainingMethodProvider;

  public constructor(
    private readonly config: HostedConfig,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    const providerConfig = loadProviderConfig({
      ...environment,
      GIELINOR_USER_AGENT: config.userAgent,
    });
    this.publicDatabase = openDatabase(config.publicDatabasePath);
    const cacheStore = new SqliteCacheStore(this.publicDatabase);
    const providers = createDefaultProviderStack(providerConfig, cacheStore);
    this.providerRegistry = providers.registry;
    this.statsProvider = providers.ports;
    this.priceProvider = providers.ports;
    this.questRepository = new SqliteQuestRepository(this.publicDatabase);
    this.trainingRepository = new SqliteTrainingMethodRepository(this.publicDatabase);
    this.priceRepository = new SqlitePriceRepository(this.publicDatabase);
    this.questProvider = providers.ports.quests;
    this.trainingProvider = providers.ports.training;
  }

  public createSession(actor: HostedActor): HostedToolSession {
    let accountDatabase: DatabaseConnection | undefined;
    const profileRepository =
      actor.kind === "account"
        ? (() => {
            accountDatabase = openDatabase(this.accountDatabasePath(actor.accountId));
            return new SqlitePlayerProfileRepository(accountDatabase);
          })()
        : new UnavailableProfileRepository();
    const profiles = new ProfileService(profileRepository, this.statsProvider);
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
    const tools = restrictToolService(
      new CompanionToolService(profiles, this.priceProvider, quests, planner, exchange),
      actor,
    );

    return {
      tools,
      profiles,
      close: () => {
        accountDatabase?.close();
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
      storage: "ready",
      datasets: {
        quests: quests.state,
        training: training.state,
        prices: prices.state,
      },
      providers: this.providerRegistry.health.snapshot(),
    };
  }

  public close(): void {
    this.publicDatabase.close();
  }

  private accountDatabasePath(accountId: string): string {
    const validated = AccountIdSchema.parse(accountId);
    const path = resolve(this.config.accountDirectory, `${validated}.db`);
    if (dirname(path) !== resolve(this.config.accountDirectory)) {
      throw new Error("Invalid account storage path");
    }
    return path;
  }
}
