# Scheduled live-provider monitoring

`.github/workflows/live-provider-monitor.yml` runs every Wednesday and on
manual dispatch. It is deliberately separate from deterministic pull-request
CI.

The monitor validates one conservative sequence covering:

- Jagex public Hiscores;
- Jagex ItemDB current guide prices;
- Jagex ItemDB historical guide prices;
- the current Grand Exchange catalogue;
- RuneScape Wiki quest data;
- RuneScape Wiki training data;
- GitHub Releases update metadata.

Requests use the descriptive project User-Agent, bounded timeouts, at most two
attempts, and a delay between top-level checks. Hiscores uses one established
public high-score account and never queries credentials or private account
data.

## Classification

Results use distinct classes:

| Classification           | Workflow result | Meaning                                  |
| ------------------------ | --------------- | ---------------------------------------- |
| `provider-outage`        | Report only     | Upstream unavailable                     |
| `dns-failure`            | Report only     | Name resolution failed                   |
| `timeout`                | Report only     | Bounded provider deadline expired        |
| `rate-limiting`          | Report only     | Provider requested a cooldown            |
| `schema-change`          | Failure         | Validated contract no longer matches     |
| `malformed-response`     | Failure         | Provider returned unusable content       |
| `empty-response`         | Failure         | Required result became empty             |
| `application-regression` | Failure         | The client failed outside provider state |

Transient failures remain visible but do not turn one temporary provider event
into a repository failure. Contract and application failures fail the workflow.
Maintainers confirm persistence before creating or updating an issue; the
workflow does not open duplicate issues automatically.

## Redacted artifacts

Each run uploads `report.json` and `summary.md` for 30 days and writes the same
summary to the GitHub Actions job summary. The report contains provider
contract IDs, status, classification, stable code, trace ID, duration, and
aggregate counts.

It never stores the test player name, credentials, request/response payloads,
headers, endpoint URLs, stack traces, or local paths.

## Local commands

Run the ordinary live Vitest contracts:

```sh
corepack pnpm test:live
```

Run the classified monitor and write redacted artifacts:

```sh
corepack pnpm build
node scripts/run-live-monitor.mjs
```

Live commands require network access and should not be used as deterministic
pull-request gates.
