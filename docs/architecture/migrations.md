# Migration policy and tooling

## SQLite

`DATABASE_MIGRATIONS` contains ordered, named migrations. Version 0.9 uses
schema version 5:

1. profiles and provider cache;
2. quest catalogue;
3. training methods;
4. Grand Exchange catalogue and history;
5. operational query indexes.

`pendingDatabaseMigrations` validates the target and contiguous version chain.
`applyDatabaseMigrations` runs each migration and `user_version` update in one
SQLite transaction. A failed statement rolls back the complete migration.
Downgrades are rejected.

File databases should be backed up with `backupDatabase` before an operator
runs a manual upgrade. Normal application startup applies forward-only,
non-destructive migrations. Tests open version 4, plan/apply version 5, inject a
failing version 6, and prove both schema and version roll back.

## Portable profiles and other data

`VersionedDataMigrator` copies the input, follows explicit version edges, checks
the version emitted by every step, and validates the final schema. A failure
cannot mutate the caller's original value.

Profile export version 1 remains current. The importer accepts the documented
legacy version-0 fixture and adds normal-account/default empty fields before
validating version 1. Future versions must add a migration edge and retain
fixtures for every supported starting version.
