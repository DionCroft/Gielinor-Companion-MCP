# Persistent maintenance scheduler

Version 1.1 keeps shared public catalogues current without requiring the
application to run continuously. The scheduler is local, bounded, and backed by
SQLite. It does not control RuneScape, download application updates, or modify
player progress.

## Jobs and defaults

| Job                     | Default interval | Purpose                                |
| ----------------------- | ---------------: | -------------------------------------- |
| `quest-refresh`         |         24 hours | Check the quest catalogue revision     |
| `training-refresh`      |         24 hours | Check training-method data             |
| `price-refresh`         |          6 hours | Refresh the Grand Exchange catalogue   |
| `software-update-check` |         24 hours | Read validated GitHub release metadata |

The software update handler reads validated GitHub release metadata. It only
checks metadata and never downloads or installs an update.

Each job persists its enabled flag, interval, last attempt, last success, next
run, consecutive failure count, last stable error code, state, and lease.
Attempt history is bounded to the latest 100 entries per job.

## Startup and first run

Startup reads the catalogue sync rows before accepting background work. A
missing catalogue is due immediately. A catalogue with a recent successful
sync is deferred until its freshness interval expires. Existing last-known-good
data remains usable while a stale refresh runs.

Desktop first-run setup displays seven stages:

1. preparing local storage;
2. refreshing public player statistics;
3. synchronising quests;
4. synchronising training methods;
5. synchronising the Grand Exchange catalogue;
6. validating the resulting local data;
7. ready.

The three catalogue operations are independent. A failed optional source shows
a stable error code and trace ID while successful catalogues and the local
profile remain available.

## Locking and crash recovery

A job is claimed with one atomic conditional SQLite update. The claim records a
random process owner, an attempt ID, and an expiring lease. A second scheduler
cannot claim the same job while that lease is live. Long operations renew their
lease periodically.

If a process exits mid-job, the next scheduler converts the expired attempt to
`interrupted`, records `GC-SCHED-002`, clears the lease, and applies bounded
backoff. The job can then be retried without deleting or replacing valid data.
Hosted sessions share the public catalogue database, so they also share one
logical job lease.

Failures use exponential backoff beginning at one minute and capped at six
hours. After five consecutive failures by default, automatic execution stops in
the observable `failed` state with `GC-SCHED-004`. A targeted manual retry is
still allowed and a success resets the counter. Polling is once per minute,
concurrency defaults to three, and overlapping polls reuse one in-process sweep.

## Configuration

All intervals are milliseconds and must be between one minute and 30 days.

| Environment variable                         | Default    |
| -------------------------------------------- | ---------- |
| `GIELINOR_MAINTENANCE_ENABLED`               | `true`     |
| `GIELINOR_REFRESH_ON_STARTUP`                | `true`     |
| `GIELINOR_BACKGROUND_REFRESH`                | `true`     |
| `GIELINOR_MAINTENANCE_CONCURRENCY`           | `3`        |
| `GIELINOR_MAINTENANCE_MAX_RECOVERY_ATTEMPTS` | `5`        |
| `GIELINOR_QUEST_REFRESH_MS`                  | `86400000` |
| `GIELINOR_TRAINING_REFRESH_MS`               | `86400000` |
| `GIELINOR_PRICE_CATALOGUE_REFRESH_MS`        | `21600000` |
| `GIELINOR_UPDATE_CHECK_MS`                   | `86400000` |

The recovery-attempt setting accepts 1 through 20. `GIELINOR_OFFLINE=true`
prevents network maintenance work. The frozen Version 1.0 manual refresh tools
remain available when automatic maintenance is disabled, and
their provider calls still enforce offline routing.

The long-lived stdio MCP and hosted runtimes start background polling. The
Tauri bridge marks its per-tool child processes as ephemeral, so those children
construct the durable scheduler for manual health and recovery tools but do not
start background polling that would be killed after a response. Desktop
first-run population remains owned by the visible onboarding flow.

## Shutdown

Shutdown stops polling, aborts active handlers, records cancelled attempts, and
waits for them to settle before closing SQLite. HTTP requests and provider
clients remain responsible for their existing bounded timeouts if an upstream
operation cannot observe cancellation immediately.
