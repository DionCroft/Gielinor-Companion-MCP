# MCP tool reference — Version 0.2

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
5.8 billion and `targetLevel` from 1 to 126. Output: current/target levels and XP,
remaining XP, and bounded percentage. Source: deterministic RuneScape XP table.
Errors: invalid XP or target level.

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
