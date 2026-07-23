# Version 0.2 data sources and risks

Version 0.2 retains the Version 0.1 Jagex Hiscores, ItemDB, and deterministic XP
sources documented in [version-0.1.md](version-0.1.md).

## RuneScape Wiki quest data

API endpoint: `https://runescape.wiki/api.php`

Page base: `https://runescape.wiki/w/`

Authentication is not required. Every request uses the configured timeout,
bounded retries, and a descriptive `GIELINOR_USER_AGENT`. Operators may override
the two endpoints with `GIELINOR_WIKI_API_URL` and `GIELINOR_WIKI_PAGE_URL`.

The adapter reads:

- Bucket `quest` for quest details, skill levels, items, and recommendations.
- Bucket `quest_rewards` for quest points and reward text.
- Bucket `infobox_quest` for membership and difficulty metadata.
- `Module:Questreq/data` for direct prerequisite edges and partial-start markers.
- MediaWiki revision IDs and timestamps for source provenance.

The Wiki Bucket API returns JSON, including some JSON-encoded string fields.
Relevant fields are runtime-validated twice: first as API rows, then as complete
domain quests. The provider rejects HTTP failures, timeouts, malformed JSON,
invalid rows, unknown skill identifiers, missing revisions, duplicate canonical
IDs, and empty responses.

The normalized local catalogue stores factual structured data and source links,
not guide prose. Wiki markup is reduced to short item/reward descriptions where
needed. The Wiki content is licensed under CC BY-NC-SA 3.0; source URLs and
revision provenance are retained. This project's MIT licence applies to project
code, not imported third-party content.

No formal rate limit is published for this read-only path. Refresh is
operator/user initiated in Version 0.2, queries the complete catalogue in bounded
pages, and should not be polled frequently. The provider uses a maximum Bucket
page size of 5,000 and MediaWiki revision batches of 50.

## Freshness and rollback

Each quest stores:

- canonical source and guide URL;
- page revision plus prerequisite-module revision;
- page update and local check timestamps;
- SHA-256 hash of normalized structured facts.

Unchanged hashes avoid false changed-page results. The catalogue is replaced in
one SQLite transaction only after the full snapshot validates. Empty or
suspiciously truncated snapshots, alias collisions, and database failures retain
the previous valid rows. `get_quest_data_status` reports the last attempt, last
success, retained count, revision, and safe error code.

## Known upstream ambiguity

Wiki item and reward fields are human-maintained markup. The adapter reliably
extracts top-level bullets, leading quantities, links, and explicit `or`
alternatives, but cannot prove whether every listed item is consumed, tradeable,
or obtainable during the quest. Such claims are intentionally omitted. Quest
requirements prefixed `Misc:` remain manual checks. `Full:` and `Follows:` lore
variants are not treated as mandatory start requirements.
