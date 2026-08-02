import type { JsonTransport } from "@gielinor/agent-runtime";
import type {
  GameMode,
  PlayerProfile,
  PlayerSkill,
  RedactedDiagnostics,
  SkillId,
  SoftwareUpdateCheck,
  SystemHealth,
} from "@gielinor/shared-types";

export type ToolEnvelope<T> = {
  data: T;
  meta: {
    generatedAt: string;
    source: string;
    traceId?: string;
    recoveryStatus?: "not-required" | "not-attempted" | "succeeded" | "failed" | "partial";
  };
};

export type RuntimeStatus = {
  ready: boolean;
  mode:
    | "native-real"
    | "browser-live-development"
    | "browser-preview"
    | "automated-test"
    | "unavailable";
  transport?: "bundled" | "development" | "configured" | "unavailable";
  message: string;
};

export interface CompanionBridge {
  runtimeStatus(): Promise<RuntimeStatus>;
  callTool<T>(tool: string, arguments_: Record<string, unknown>): Promise<ToolEnvelope<T>>;
  localAiTransport(): JsonTransport;
}

export type DesktopProfile = PlayerProfile;
export type DesktopSkill = PlayerSkill;
export type DesktopSkillId = SkillId;
export type DesktopGameMode = GameMode;
export type DesktopSystemHealth = SystemHealth;
export type DesktopRedactedDiagnostics = RedactedDiagnostics;
export type DesktopSoftwareUpdateCheck = SoftwareUpdateCheck;

export type DataStatus = {
  state: "never-synced" | "ready" | "failed";
  provider?: string;
  lastSuccessfulSyncAt?: string;
  lastAttemptAt?: string;
  lastErrorMessage?: string;
  questCount?: number;
  methodCount?: number;
  itemCount?: number;
  historyPointCount?: number;
  coveredSkills?: string[];
};

export type QuestSummary = {
  id: string;
  name: string;
  members: boolean;
  difficulty?: string;
  length?: string;
  questPointReward?: number;
  sourcePageUrl?: string;
};

export type QuestRoute = {
  targetQuestId: string;
  steps: Array<{
    questId: string;
    name: string;
    status: "not-started" | "in-progress" | "completed";
    depth: number;
  }>;
  alternatives: unknown[];
};

export type ShoppingList = {
  targetQuestId: string;
  routeQuestIds: string[];
  items: Array<{
    itemId?: number;
    name: string;
    quantity: number;
    alternatives: string[];
    requiredByQuestIds: string[];
  }>;
};

export type TrainingPlan = {
  skillId: string;
  currentLevel: number;
  targetLevel: number;
  experienceRequired: number;
  strategy: string;
  totalHoursRange?: { minimum: number; maximum: number };
  totalGpRange?: { minimum: number; maximum: number };
  completionDateRange?: { earliest: string; latest: string };
  feasible: boolean;
  warnings: string[];
  assumptions: string[];
  stages: Array<{
    startLevel: number;
    endLevel: number;
    experience: number;
    method: { id: string; name: string; afkRating?: string };
    hoursRange: { minimum: number; maximum: number };
    gpRange?: { minimum: number; maximum: number };
    warnings: string[];
  }>;
};

export type PriceItem = {
  itemId: number;
  name: string;
  currentPrice?: number;
  buyLimit?: number;
  alchemyValue?: number;
  volume?: number;
  timestamp: string;
  sourceName: string;
};

export type PriceSummary = {
  itemId: number;
  name: string;
  range: string;
  currentPrice?: number;
  historicalHigh?: number;
  historicalLow?: number;
  percentageChange?: number;
  movingAverages: { days7?: number; days30?: number; days90?: number };
  volatilityPercent?: number;
  priceFreshness: { state: string; timestamp?: string; ageSeconds?: number };
  historyFreshness: { state: string; timestamp?: string; ageSeconds?: number };
  chart: Array<{ timestamp: string; price: number; averagePrice?: number }>;
  warnings: string[];
  unavailableFields: string[];
};

export type Valuation = {
  items: Array<{
    itemId?: number;
    name: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
    missingReason?: string;
  }>;
  totalValue: number;
  complete: boolean;
  warnings: string[];
};

export type LocalGoal = {
  id: string;
  title: string;
  target: string;
  completed: boolean;
  createdAt: string;
};
