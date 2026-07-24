# MCP tool reference — Version 0.8

All tools use strict JSON object inputs. Successful responses use:

```json
{
  "data": {},
  "meta": {
    "generatedAt": "2026-07-23T18:00:00.000Z",
    "source": "source description"
  }
}
```

Errors set MCP `isError: true` and return
`{"error":{"code":"STABLE_CODE","message":"Safe message"}}`. Common errors are
`NOT_FOUND`, `PROVIDER_NOT_FOUND`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`,
`MALFORMED_PROVIDER_RESPONSE`, `EMPTY_PROVIDER_RESPONSE`,
`QUEST_PREREQUISITE_CYCLE`, `MISSING_QUEST_DATA`, and `INTERNAL_ERROR`. Schema
violations are reported by the MCP SDK before a handler runs.

Levelling-specific errors include `VIRTUAL_LEVEL_OPT_IN_REQUIRED`,
`UNREACHABLE_LEVEL_TARGET`, `MISSING_TRAINING_RATE`,
`MALFORMED_TRAINING_DATA`, and `SUSPICIOUS_TRAINING_SNAPSHOT`.

## `create_player_profile`

Creates a local profile. Input: required `displayName`; optional `gameMode`,
`availableGp`, `preferredPlayStyle`, and `availableHoursPerDay`. Output `data` is
the complete profile with a generated UUID. Source: local SQLite. Errors include
invalid display name/preferences or a database write failure.

Request:

```json
{ "displayName": "Rune Tester", "availableGp": 50000000, "preferredPlayStyle": "balanced" }
```

Response data:

```json
{
  "id": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650",
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "availableGp": 50000000,
  "preferredPlayStyle": "balanced",
  "skills": [],
  "completedQuestIds": [],
  "inProgressQuestIds": [],
  "goals": []
}
```

## `get_player_profile`

Reads a local profile. Input: `profileId` UUID. Output: complete profile. Source:
local SQLite. Error: `NOT_FOUND` when the UUID is unknown.

Request:

```json
{ "profileId": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650" }
```

Response data:

```json
{
  "id": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650",
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "skills": [],
  "completedQuestIds": [],
  "inProgressQuestIds": [],
  "goals": []
}
```

## `list_player_profiles`

Lists local profiles. Input: `{}`. Output: profile array ordered by display name.
Source: local SQLite. Database read failures are returned as safe internal errors.

Request:

```json
{}
```

Response data:

```json
[
  {
    "id": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650",
    "displayName": "Rune Tester",
    "gameMode": "normal",
    "skills": [],
    "completedQuestIds": [],
    "inProgressQuestIds": [],
    "goals": []
  }
]
```

## `get_player_stats`

Reads public Hiscores without saving a profile. Input: `displayName`, optional
`gameMode`, optional `forceRefresh`. Output: display name, mode, exactly 29 skill
records, and source metadata containing retrieval/cache timestamps and
`miss|fresh|stale`. Source: Jagex public Hiscores. Errors include unavailable
player, timeout, transport failure, or malformed rows.

Request:

```json
{ "displayName": "Rune Tester", "gameMode": "normal" }
```

Response data (skills shortened):

```json
{
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "skills": [{ "skillId": "attack", "level": 80, "experience": 2000000, "rank": 12345 }],
  "source": {
    "name": "Jagex public Hiscores",
    "retrievedAt": "2026-07-23T18:00:00.000Z",
    "cacheStatus": "fresh",
    "cacheStoredAt": "2026-07-23T17:58:00.000Z"
  }
}
```

## `refresh_player_stats`

Forces a public Hiscores request and saves its validated skills into a local
profile. Input: `profileId`. Output: updated profile with
`lastHiscoresRefresh`. Sources: Jagex public Hiscores and local SQLite. Errors:
unknown profile plus the provider errors described above. No RuneScape account is
modified.

Request:

```json
{ "profileId": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650" }
```

Response data (skills shortened):

```json
{
  "id": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650",
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "skills": [{ "skillId": "attack", "level": 80, "experience": 2000000, "rank": 12345 }],
  "completedQuestIds": [],
  "inProgressQuestIds": [],
  "goals": [],
  "lastHiscoresRefresh": "2026-07-23T18:00:00.000Z"
}
```

## `update_player_preferences`

Updates local planning preferences. Input: `profileId` and any of `availableGp`,
`preferredPlayStyle`, `availableHoursPerDay`. Output: updated profile. Source:
local SQLite. Errors: unknown profile, invalid values, or database write failure.

Request:

```json
{ "profileId": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650", "availableHoursPerDay": 2 }
```

Response data:

```json
{
  "id": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650",
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "availableHoursPerDay": 2,
  "skills": [],
  "completedQuestIds": [],
  "inProgressQuestIds": [],
  "goals": []
}
```

## `export_player_profile`

Exports portable schema version 1. Input: `profileId`. Output excludes local
profile UUID, skills snapshot, and local goal UUIDs. Source: local SQLite. Error:
unknown profile.

Request:

```json
{ "profileId": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650" }
```

Response data:

```json
{
  "schemaVersion": 1,
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "completedQuestIds": [],
  "inProgressQuestIds": [],
  "goals": [{ "type": "quest", "targetId": "plagues-end" }]
}
```

## `import_player_profile`

Validates and imports a portable profile. Input: `profile` matching
`data/schemas/profile-export.schema.json`. Output: local profile with new profile
and goal UUIDs. Source: local SQLite. Errors include unsupported schema version,
unknown fields, invalid values, or database write failure.

Request:

```json
{
  "profile": {
    "schemaVersion": 1,
    "displayName": "Rune Tester",
    "gameMode": "normal",
    "completedQuestIds": [],
    "inProgressQuestIds": [],
    "goals": []
  }
}
```

Response data:

```json
{
  "id": "66a41f69-f303-446e-826b-1873573ee59c",
  "displayName": "Rune Tester",
  "gameMode": "normal",
  "skills": [],
  "completedQuestIds": [],
  "inProgressQuestIds": [],
  "goals": []
}
```

## `calculate_xp_remaining`

Calculates progress without network access. Input: `currentExperience` from 0 to
5.8 billion, `targetLevel`, and optional canonical `skillId`. Without a skill it
uses the standard curve through 126. With `invention`, it uses the elite curve
through 150. Other skill IDs add true-cap and virtual-target metadata. Output:
current/target levels and XP, remaining XP, and bounded percentage. Source:
deterministic revisioned RuneScape XP tables. Errors: invalid XP or target level.

Request:

```json
{ "currentExperience": 1000000, "targetLevel": 99 }
```

Response data:

```json
{
  "currentExperience": 1000000,
  "currentLevel": 73,
  "targetLevel": 99,
  "targetExperience": 13034431,
  "experienceRemaining": 12034431,
  "progressPercent": 7.67
}
```

## `get_skill_progress`

Calculates a refreshed local profile skill's progress. Input: `profileId`,
canonical `skillId`, and `targetLevel`. Output adds `skillId` and the profile's
Hiscores refresh timestamp to the XP calculation. Sources: local profile and
deterministic XP table. Errors: unknown profile, skill snapshot missing, or
invalid target.

Request:

```json
{ "profileId": "4f9c4fc4-cdb7-4c88-a0d4-d0c97d89c650", "skillId": "herblore", "targetLevel": 99 }
```

Response data:

```json
{
  "skillId": "herblore",
  "currentExperience": 1000000,
  "currentLevel": 73,
  "targetLevel": 99,
  "targetExperience": 13034431,
  "experienceRemaining": 12034431,
  "progressPercent": 7.67,
  "hiscoresRefreshedAt": "2026-07-23T18:00:00.000Z"
}
```

## `get_item_price`

Reads one current RS3 guide price. Input: positive integer `itemId` and optional
`forceRefresh`. Output: item ID/name/current price, retrieval/cache timestamps,
cache state, and source. Source: Jagex Grand Exchange ItemDB. Errors include
unknown item, timeout, unavailable provider, or unsupported/malformed price. The
value is not a guaranteed transaction price.

Request:

```json
{ "itemId": 4151 }
```

Response data:

```json
{
  "itemId": 4151,
  "name": "Abyssal whip",
  "currentPrice": 68400,
  "timestamp": "2026-07-23T18:00:00.000Z",
  "sourceName": "Jagex Grand Exchange ItemDB",
  "cacheStatus": "fresh",
  "cacheStoredAt": "2026-07-23T17:59:00.000Z"
}
```

## Quest-tool data and privacy

Quest reads use the last fully validated local RuneScape Wiki snapshot. They do
not make a network request. `refresh_quest_data` is the only quest tool that
contacts the Wiki. Status tools write only the selected local profile; no
RuneScape account or client is read or modified.

## `search_quests`

Purpose: search canonical names and aliases. Input: `query` and optional `limit`
(1–100, default 20). Output: complete matching quest records. Example:
`{"query":"plague","limit":5}`. Source/cache: local revisioned Wiki snapshot.
Errors: empty input or invalid stored data. Privacy: no profile data is read.

## `get_quest`

Purpose: resolve one quest by ID, name, or alias. Input:
`{"quest":"Plague's End"}`. Output: the complete quest record, including
requirements, rewards, provenance, revision, and content hash. Source/cache:
local revisioned Wiki snapshot. Errors: `NOT_FOUND` or invalid stored data.
Privacy: no profile data is read.

## `get_quest_requirements`

Purpose: return only planning requirements. Input:
`{"quest":"plagues-end"}`. Output includes `prerequisiteGroups`,
`skillRequirements`, `questPointRequirement`, `otherRequirements`,
`itemRequirements`, and `recommendedItems`. Source/cache: local revisioned Wiki
snapshot. Errors: `NOT_FOUND`. Privacy: no profile data is read.

## `get_quest_rewards`

Purpose: return quest points and structured rewards. Input:
`{"quest":"Plague's End"}`. Output:
`{"questId":"plagues-end","questPointReward":2,"rewards":[...]}`. Source/cache:
local revisioned Wiki snapshot. Errors: `NOT_FOUND`. Reward text is factual
source data, not a guarantee of account eligibility. Privacy: no profile data.

## `get_quest_source`

Purpose: explain provenance. Input: `{"quest":"plagues-end"}`. Output includes
source/guide URLs, source revision, source update/check timestamps, and SHA-256
content hash. Source/cache: local sync metadata. Errors: `NOT_FOUND`. Privacy: no
profile data is read.

## `set_quest_status`

Purpose: set one manual local status. Input:
`{"profileId":"<uuid>","quest":"Plague's End","status":"completed"}` where status
is `not-started`, `in-progress`, or `completed`. Output: the updated profile.
Source/cache: local SQLite profile and quest alias catalogue. Errors:
`NOT_FOUND`, invalid status, or database failure. Privacy: changes local
companion data only; it does not claim the in-game quest is complete.

## `set_multiple_quest_statuses`

Purpose: apply 1–500 status changes with one profile save. Input:
`{"profileId":"<uuid>","updates":[{"quest":"Plague's End","status":"completed"}]}`.
Output: the updated profile with disjoint, sorted completed/in-progress IDs.
Source/cache: local SQLite. Errors: unknown quest/profile, empty/invalid batch, or
database failure. The batch is resolved before saving. Privacy: local only.

## `list_available_quests`

Purpose: list not-started quests whose known prerequisite, skill, and tracked
quest-point requirements are met. Input: `{"profileId":"<uuid>"}`. Output:
quest/status records with manual checks, recommendation score, and explainable
reasons. Source/cache: local profile plus local Wiki snapshot. Errors: unknown
profile or invalid stored data. Manual requirements remain visible and are not
silently asserted. Privacy: reads one local profile.

## `list_missing_quest_requirements`

Purpose: show blockers across a target route. Input:
`{"profileId":"<uuid>","quest":"Plague's End"}`. Output: missing prerequisite
statuses, maximum missing skill levels with requiring quests, and manual checks.
Source/cache: local profile plus local Wiki snapshot. Errors: `NOT_FOUND`,
`MISSING_QUEST_DATA`, or `QUEST_PREREQUISITE_CYCLE`. Privacy: reads one local
profile; no bank/inventory data is inferred.

## `create_quest_route`

Purpose: topologically order uncompleted prerequisites before the target. Input:
`{"profileId":"<uuid>","quest":"Plague's End"}`. Output:
`{"targetQuestId":"plagues-end","steps":[...],"alternatives":[...]}`. `any`
groups select the lowest-cost unsatisfied branch while reporting every option.
Source/cache: deterministic core graph over local data. Errors:
`MISSING_QUEST_DATA`, `QUEST_PREREQUISITE_CYCLE`, or `NOT_FOUND`. Privacy: reads
manual statuses from one local profile.

## `create_quest_shopping_list`

Purpose: aggregate required top-level items for every remaining route quest.
Input: `{"profileId":"<uuid>","quest":"Plague's End"}`. Output: route quest IDs
and case-insensitively deduplicated item quantities, alternatives, and requiring
quest IDs. Source/cache: deterministic route plus local Wiki snapshot. Errors are
the route errors above. Quantities are planning guidance; bank contents,
consumption, and tradeability are not inferred. Privacy: reads one local profile.

## `refresh_quest_data`

Purpose: retrieve a new complete Wiki snapshot and apply it transactionally.
Input: `{}`. Output counts `total`, `inserted`, `updated`, `unchanged`, and
`removed`, plus provider revision and check time. Source: RuneScape Wiki Bucket
and MediaWiki APIs; no background schedule in Version 0.2. Errors distinguish
timeouts, network/HTTP failures, malformed/empty responses, suspicious
truncation, alias ambiguity, and database failure. The previous valid catalogue
is retained on failure. Privacy: sends only the configured User-Agent.

## `get_quest_data_status`

Purpose: inspect refresh health without contacting the network. Input: `{}`.
Output state (`never-synced`, `ready`, or `failed`), retained quest count,
provider/revision, last attempt/success times, and safe last error where present.
Source/cache: local SQLite sync status. Errors: database failure. Privacy: no
profile data is read and internal paths/stacks are not returned.

## Training-tool data and safety

Training reads use the last fully validated local Wiki snapshot.
`refresh_training_data` is the only training tool that contacts the network.
Published rates remain ranges; positive plan GP totals are costs and negative
totals are projected profit. Missing values are omitted with a warning, never
invented. All outputs are planning guidance and never operate the game client.

## `list_training_methods`

Lists methods, optionally filtered by `skillId`, `level`, `members`, or
`ironman`. Input may be `{}`. Output contains complete structured methods,
including levels, rates where available, attention, requirements, uncertainty,
revision, timestamps, URL, and hash. Source: local training snapshot. No profile
is read.

## `get_training_method`

Resolves one exact `methodId`. Example:
`{"methodId":"mining:89:97:corrupted-ore"}`. Output is the complete method.
Errors: `NOT_FOUND` or invalid stored data.

## `compare_training_methods`

Compares methods applicable between a refreshed profile's current XP and a
target. Required input: `profileId`, `skillId`, `targetLevel`. Optional:
`methodIds`, `members`, `allowVirtualLevels`. Output includes applicable XP,
best/worst hours where rated, cost/profit where published, access blockers, and
warnings. Unknown rates have no fake `hoursRange`.

## `create_levelling_plan`

Creates a multi-stage plan. Required input: `profileId`, `skillId`,
`targetLevel`. Optional:

- `strategy`: `fastest|cheapest|balanced|afk`;
- `methodId`: force one method;
- `budgetGp`, `hoursPerDay`, `targetDate`;
- `members` (defaults true);
- `allowVirtualLevels` (defaults false).

Output includes exact current/target XP, true cap, virtual status, merged stages,
per-stage methods/rates/time/cost/warnings, total ranges, completion dates,
feasibility, and assumptions. Errors identify uncovered ranges, access gates,
missing rates, invalid targets, or missing profile skills.

## `create_weekly_goal_plan`

Uses the levelling-plan input plus optional `weeks` (1–520). Output embeds the
full plan and adds weekly XP, weekly best/worst hours, and whether the plan fits
the tracked or supplied daily play time.

## `estimate_time_to_level`

Uses the levelling-plan input and returns the target, remaining XP, total
best/worst hours, optional completion-date range, feasibility, and warnings.
Supplying `methodId` estimates only that method and fails explicitly if its
source has no hourly rate.

## `estimate_cost_to_level`

Uses the levelling-plan input and returns the target, remaining XP, total GP
range where supported, feasibility, and warnings. An absent GP range means at
least one stage has no reliable cost/profit data.

## `compare_quest_xp_rewards`

Required input: `skillId`; optional `profileId` and `limit` (1–100). Output ranks
quests by total structured XP reward for that skill. With a profile, each row
marks whether the quest is already manually completed. Source: local quest
snapshot.

## `refresh_training_data`

Fetches exact Wiki revisions, validates all source pages and methods, and
transactionally replaces the training catalogue. Input: `{}`. Output includes
inserted/updated/unchanged/removed counts and a snapshot revision digest.
Malformed, empty, duplicate, implausible-rate, incomplete, timeout, and
transport failures retain the previous snapshot.

## `get_training_data_status`

Reads synchronization health without network access. Input: `{}`. Output:
`never-synced|ready|failed`, retained method count, covered skills, provider,
revision digest, last attempt/success, and safe last error.

## Grand Exchange data and safety

Grand Exchange intelligence uses the last transactionally validated local
catalogue and on-demand official Jagex graph history. Guide prices are not
instant offers, predictions, or guaranteed transactions. Public RS3 sources do
not publish an instant high/low order book, so those fields remain explicitly
unavailable. Tools never place, modify, or collect an offer.

## `search_items`

Purpose: search canonical names, normalized aliases, Portuguese source aliases,
or exact numeric IDs. Input: `query` and optional `limit` (1–100, default 20).
Example: `{"query":"abyssal whip","limit":5}`. Output: matching complete
catalogue records with timestamps and hashes. Source/cache: local snapshot; no
network call or profile read. Errors: empty query, invalid limit, database or
stored-data failure.

## `get_item_details`

Purpose: resolve an item name/alias/ID and explain all known current metadata.
Input: `{"item":"Abyssal whip"}` or `{"item":4151}`. Output includes current and
previous guide price, buy limit, high/low alchemy, latest volume, membership,
source URL/timestamps/hash, freshness, unavailable fields, and disclaimer.
Source/cache: local catalogue. Errors: `NOT_FOUND`, `AMBIGUOUS_ITEM_ALIAS`, or
invalid stored data. Privacy: no profile is read.

## `get_item_price_history`

Purpose: return ordered chart data. Input: `item`, optional
`range=24h|7d|30d|90d|180d` (default `30d`), and optional `forceRefresh`.
Example: `{"item":4151,"range":"90d"}`. Output includes item/name/range,
`points[{timestamp,price,averagePrice?}]`, retrieval time, cache state, source,
warnings, and `chartReady:true`. Source: official Jagex ItemDB graph plus SQLite.
Fresh history is reused for six hours; validated history up to seven days old
may be returned as `stale` on outage. Errors distinguish missing item/history,
timeout, rate limit/HTTP, network, malformed response, and database failure.

## `get_item_buy_limit`

Purpose: return a published four-hour buy limit. Input: `item` name/alias/ID.
Output: item ID/name, optional `buyLimit`, `available`, and source update time.
Source/cache: local catalogue. Missing source values return `available:false`
rather than an estimate. No profile is read and no GE action occurs.

## `get_item_alchemy_value`

Purpose: return published high- and low-alchemy values. Input: `item`.
Output: item ID/name, optional `highAlchemyValue`/`lowAlchemyValue`, `available`,
and source update time. Source/cache: local catalogue. Missing data is omitted;
the result is not a profit claim.

## `get_item_price_summary`

Purpose: calculate transparent descriptive statistics. Input matches
`get_item_price_history`. Output includes current/first/latest price,
range high/low, percentage change, 7/30/90-point moving averages, population
daily-return volatility percent, 2.5-standard-deviation outliers, freshness,
cache state, chart points, unavailable fields, and warnings. Source: deterministic
core over validated history. Too few points omit unsupported statistics.

Example response data:

```json
{
  "itemId": 4151,
  "name": "Abyssal whip",
  "range": "30d",
  "currentPrice": 83753,
  "historicalHigh": 85000,
  "historicalLow": 80000,
  "percentageChange": 1.42,
  "movingAverages": { "days7": 83310.14, "days30": 82540.7 },
  "volatilityPercent": 0.84,
  "outliers": [],
  "priceFreshness": { "state": "fresh", "timestamp": "2026-07-23T00:00:00.000Z" },
  "historyFreshness": { "state": "fresh" },
  "cacheStatus": "fresh",
  "chart": [],
  "unavailableFields": ["instant buy/high price", "instant sell/low price"],
  "warnings": []
}
```

## `compare_item_prices`

Purpose: compare statistics for 1–20 items. Input:
`{"items":[4151,"Coal"],"range":"30d"}`. Output: one full price summary per item
in request order. Source/cache/errors match `get_item_price_summary`. The tool
does not rank expected profit.

## `value_item_list`

Purpose: value inventory or shopping lines and aggregate duplicate aliases/IDs.
Input: 1–500 `items`, each with `item` and positive safe-integer `quantity`.
Example: `{"items":[{"item":"Coal","quantity":1000}]}`. Output contains resolved
lines, unit/total prices, timestamps/freshness, missing reasons, safe total,
priced/unpriced counts, completeness, and warnings. Unknown/ambiguous/unpriced
lines remain visible. Multiplication/addition overflow returns `VALUE_OVERFLOW`.
Source: local catalogue. No bank or inventory is inspected.

## `value_equipment_setup`

Purpose: retain named slots while valuing a setup. Input: 1–100 lines with
`slot`, `item`, and `quantity`. Example:
`{"items":[{"slot":"main hand","item":4151,"quantity":1}]}`. Output contains the
requested slots and the same complete valuation object as `value_item_list`.
Source/errors/privacy are identical; actual worn equipment is never read.

## `calculate_quest_shopping_cost`

Purpose: price the aggregate shopping list for a profile-aware quest route.
Input: `profileId` and `quest`. Output: the complete deterministic quest shopping
list plus valuation. Source: local profile, local quest snapshot, and local GE
catalogue. Errors include route/cycle/missing quest data and valuation errors.
Bank contents, alternatives chosen, consumption, and tradeability are not
inferred.

## `calculate_training_cost`

Purpose: expose the levelling plan's published GP range and optionally value
caller-supplied consumables at current guide prices. Input is the full
`create_levelling_plan` input plus optional
`materials:[{item,quantity}]`. Output: plan, optional separate material
valuation, recalculation basis, and warnings. Separation prevents accidental
double-counting. Source: deterministic planner, training snapshot, and local GE
catalogue. No rate, usage quantity, outcome, or profit is guaranteed.

## `export_price_data`

Purpose: return portable price history content. Input: 1–20 `items`, optional
range, `format=json|csv`, and optional `forceRefresh`. Output: format, MIME type,
safe suggested filename, content string, item count, and point count. JSON
includes schema version, export time, disclaimer, summaries, and charts. CSV
contains item ID/name/timestamp/price/average/range; cells are quoted and
formula-leading text is neutralized. No arbitrary path is accepted or written.

## `refresh_price_data`

Purpose: fetch and transactionally replace the complete catalogue, optionally
refreshing history for up to 20 positive `itemIds`. Input:
`{"itemIds":[4151]}` or `{}`. Output: catalogue inserted/updated/unchanged/removed
counts and selected history counts/timestamps/cache states. Source: Wiki GE
Market Watch dump and official Jagex graph. Errors distinguish timeout, rate
limit/HTTP, network, malformed/duplicate/incomplete data, missing items, and
database failure. The prior catalogue survives any failed candidate.

## `get_price_data_status`

Purpose: inspect local GE health without contacting the network. Input: `{}`.
Output: `never-synced|ready|failed`, provider/revision/update/attempt/success
times, catalogue/history item and point counts, newest history time, safe last
error, catalogue freshness, and public-source disclaimer. No profile data,
filesystem path, or stack trace is returned.
