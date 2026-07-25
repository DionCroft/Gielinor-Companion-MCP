# Database recovery and safe mode

Every file-database startup performs a full SQLite integrity check before normal
services are activated. A schema upgrade from an existing database first creates
a consistent `VACUUM INTO` backup, verifies its integrity and schema version, and
writes a private migration marker. Only then are forward migrations applied.

After migration, the database is checked again and its target version is verified.
Each migration and its `user_version` change remain one transaction. If an
upgrade fails, the runtime closes the database, verifies the pre-upgrade backup,
preserves the failed file under a separate local name, restores the backup, and
starts read-only safe mode.

## Interrupted upgrades

The marker records the source version, target version, opaque backup ID, and local
backup path. On the next startup:

- if the target database is already valid at the target version, marker cleanup
  resumes and normal startup continues;
- otherwise, the exact source-version backup is verified and restored before the
  upgrade is retried;
- if the marker or backup cannot be verified, no automatic replacement occurs.
  The original database is preserved and safe mode starts.

## Safe mode

Safe mode uses a separate, empty in-memory database with SQLite `query_only`
enabled. This lets diagnostics start without writing to or replacing the user's
file. Profile, progress, catalogue, and cache files remain untouched.

Diagnostics report only status, schema version, stable error code, trace ID,
opaque backup ID, recovery action, and suggested next steps. Absolute paths,
database contents, player names, profile IDs, credentials, and raw SQLite errors
are not exported.

Explicit restore accepts only a backup inside the database directory, opens it
read-only, runs an integrity check, verifies the expected schema version when
provided, copies and verifies a temporary candidate, then preserves the replaced
file before installing the candidate. An invalid backup is never activated.
