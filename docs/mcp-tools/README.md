# MCP tool reference — Version 0.1

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
`MALFORMED_PROVIDER_RESPONSE`, and `INTERNAL_ERROR`. Schema violations are
reported by the MCP SDK before a handler runs.

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
