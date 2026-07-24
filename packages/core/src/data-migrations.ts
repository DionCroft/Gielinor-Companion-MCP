import {
  LegacyProfileExportV0Schema,
  ProfileExportSchema,
  type ProfileExport,
} from "@gielinor/shared-types";
import { z } from "zod";

import { CompanionError } from "./errors.js";

export type DataMigration = {
  fromVersion: number;
  toVersion: number;
  name: string;
  migrate(value: unknown): unknown;
};

const VersionedPayloadSchema = z
  .object({
    schemaVersion: z.number().int().nonnegative(),
  })
  .passthrough();

export class VersionedDataMigrator<T> {
  private readonly migrations: ReadonlyMap<number, DataMigration>;

  public constructor(
    private readonly targetVersion: number,
    private readonly targetSchema: z.ZodType<T>,
    migrations: readonly DataMigration[],
  ) {
    if (!Number.isSafeInteger(targetVersion) || targetVersion < 0) {
      throw new Error("Data migration target must be a non-negative safe integer");
    }
    const indexed = new Map<number, DataMigration>();
    for (const migration of migrations) {
      if (
        !Number.isSafeInteger(migration.fromVersion) ||
        !Number.isSafeInteger(migration.toVersion) ||
        migration.fromVersion < 0 ||
        migration.toVersion <= migration.fromVersion
      ) {
        throw new Error(`Data migration ${migration.name} has invalid versions`);
      }
      if (indexed.has(migration.fromVersion)) {
        throw new Error(`Duplicate data migration from version ${migration.fromVersion}`);
      }
      indexed.set(migration.fromVersion, migration);
    }
    this.migrations = indexed;
  }

  public migrate(input: unknown): T {
    let current: unknown;
    try {
      current = structuredClone(input);
    } catch (error) {
      throw new CompanionError(
        "Data migration input could not be copied safely",
        "DATA_MIGRATION_FAILED",
        { cause: error },
      );
    }

    try {
      let version = VersionedPayloadSchema.parse(current).schemaVersion;
      if (version > this.targetVersion) {
        throw new CompanionError(
          `Data version ${version} is newer than supported version ${this.targetVersion}`,
          "UNSUPPORTED_DATA_VERSION",
        );
      }
      const visited = new Set<number>();
      while (version < this.targetVersion) {
        if (visited.has(version)) {
          throw new Error(`Data migration cycle detected at version ${version}`);
        }
        visited.add(version);
        const migration = this.migrations.get(version);
        if (migration === undefined) {
          throw new CompanionError(
            `No data migration exists from version ${version}`,
            "MISSING_DATA_MIGRATION",
          );
        }
        current = migration.migrate(current);
        version = VersionedPayloadSchema.parse(current).schemaVersion;
        if (version !== migration.toVersion) {
          throw new Error(
            `Data migration ${migration.name} produced version ${version}, expected ${migration.toVersion}`,
          );
        }
      }
      return this.targetSchema.parse(current);
    } catch (error) {
      if (error instanceof CompanionError) {
        throw error;
      }
      throw new CompanionError(
        "Data migration failed; the original input was not modified",
        "DATA_MIGRATION_FAILED",
        { cause: error },
      );
    }
  }
}

export const PROFILE_EXPORT_MIGRATIONS: readonly DataMigration[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    name: "legacy-profile-defaults",
    migrate: (value) => {
      const legacy = LegacyProfileExportV0Schema.parse(value);
      return {
        schemaVersion: 1,
        displayName: legacy.displayName,
        gameMode: legacy.gameMode ?? "normal",
        ...(legacy.availableGp === undefined ? {} : { availableGp: legacy.availableGp }),
        ...(legacy.preferredPlayStyle === undefined
          ? {}
          : { preferredPlayStyle: legacy.preferredPlayStyle }),
        ...(legacy.availableHoursPerDay === undefined
          ? {}
          : { availableHoursPerDay: legacy.availableHoursPerDay }),
        completedQuestIds: legacy.completedQuestIds ?? [],
        inProgressQuestIds: legacy.inProgressQuestIds ?? [],
        goals: legacy.goals ?? [],
      };
    },
  },
];

const profileExportMigrator = new VersionedDataMigrator<ProfileExport>(
  1,
  ProfileExportSchema,
  PROFILE_EXPORT_MIGRATIONS,
);

export function migrateProfileExport(input: unknown): ProfileExport {
  return profileExportMigrator.migrate(input);
}
