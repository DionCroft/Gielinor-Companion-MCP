# Migration policy and tooling

## SQLite

`DATABASE_MIGRATIONS` contains ordered, named migrations. Version 1.1 uses
schema version 6 while preserving every Version 1.0 row:

1. profiles and provider cache;
2. quest catalogue;
3. training methods;
4. Grand Exchange catalogue and history;
5. operational query indexes;
6. resilience state, provider-cache metadata, persistent quarantine, and
   recovery events, plus persistent maintenance jobs, attempts, and leases.

`pendingDatabaseMigrations` validates the target and contiguous version chain.
`applyDatabaseMigrations` runs each migration and `user_version` update in one
SQLite transaction. A failed statement rolls back the complete migration.
Downgrades are rejected.

`openResilientDatabase` verifies integrity and creates a verified backup before
upgrading a file database. It restores that backup after a failed migration or
enters read-only safe mode when an unambiguous restore is not possible. Tests
open version 4, plan/apply versions 5 and 6, inject a failing version 7, and
prove both schema and version roll back.

The exported `DATABASE_SCHEMA_VERSION` must equal the final migration version.
Stable releases never edit SQL already shipped under an existing number. A
future schema change appends one named migration, adds fresh/upgrade/rollback
tests, documents backup/recovery, and increments the constant. Automatic
downgrades and destructive data rewrites are not supported.

## Portable profiles and other data

`VersionedDataMigrator` copies the input, follows explicit version edges, checks
the version emitted by every step, and validates the final schema. A failure
cannot mutate the caller's original value.

Profile export version 1 remains current. The importer accepts the documented
legacy version-0 fixture and adds normal-account/default empty fields before
validating version 1. Future versions must add a migration edge and retain
fixtures for every supported starting version.

Profile schema v1 is a stable portable contract. A compatible release may add
only optional fields with safe defaults. Removing, renaming, or narrowing a
field requires a new schema version and a copied, validated migration edge.
