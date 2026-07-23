# Version 0.1 data sources and risks

## Jagex public Hiscores

Normal endpoint:
`https://secure.runescape.com/m=hiscore/index_lite.ws`

Ironman and Hardcore Ironman use their public Hiscores variants. A display name is
sent as the `player` query parameter. The adapter expects the overall row followed
by the current 29-skill RS3 order ending in Necromancy.

Risks and handling:

- Jagex does not publish a formal stability guarantee for the lite response.
- Unranked or private/unavailable names can return not-found responses.
- A new skill or changed row order requires an adapter and fixture update.
- Results are validated for row count, integers, skill bounds, and exact domain
  shape before caching.
- Default fresh/stale periods are 15/60 minutes.

The normal endpoint is configurable with `GIELINOR_HISCORES_URL`. Mode-specific
endpoints remain known adapter constants in 0.1 and should become fully
configurable if operators demonstrate that requirement.

## Jagex Grand Exchange ItemDB

Endpoint:
`https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json`

The adapter requests one positive item ID, validates the returned ID/name/current
price, and normalizes Jagex compact values such as `5.2m`. The result is a guide
price, not a live order book or guaranteed trade price. High/low instant prices,
buy limits, alchemy values, and history are unavailable from this 0.1 adapter.

Default fresh/stale periods are 5/60 minutes. The endpoint is configurable with
`GIELINOR_GE_URL`.

The reviewed RS3 history candidate for 0.4 is Weird Gloop's
`/exchange/history/rs` API. It is deliberately not used as if it were the
OSRS-only `prices.runescape.wiki/api/v1/osrs` service. Rate limits, provenance,
item metadata joining, and response contracts must be verified again when 0.4 is
implemented.

## HTTP behavior

Every request sends a descriptive User-Agent and uses a configurable timeout.
HTTP 408, 425, 429, and 5xx responses receive bounded exponential retries.
Not-found and malformed responses are not retried. Provider bodies and local file
paths are not included in MCP errors.

## XP table

Thresholds are generated from the established RuneScape level formula:
accumulate `floor(level + 300 * 2^(level/7))`, then divide accumulated points by
four and floor. Tests pin representative thresholds including levels 99, 120,
and 126. XP values are deterministic and require no external refresh.
