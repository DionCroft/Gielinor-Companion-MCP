# Version 0.5 desktop data-source behavior

Version 0.5 adds no new RuneScape data provider. The desktop application uses
the exact Version 0.1–0.4 provider, validation, provenance, cache, and SQLite
paths through the local MCP runtime.

The Data sources view reports:

- retained record counts;
- provider names;
- last successful refresh timestamps;
- ready, never-synced, or failed state;
- the most recent safe provider error.

Quest, training, and Grand Exchange refreshes remain explicit local actions. A
candidate snapshot is validated before a transaction and a failed refresh does
not replace retained rows. Offline mode disables these explicit refresh buttons
and keeps deterministic cached views available.

The browser preview used in tests is a deterministic fixture and is visibly
identified as such. It is not used by the installed Tauri application.
