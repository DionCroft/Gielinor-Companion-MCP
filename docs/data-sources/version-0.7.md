# Version 0.7 hosted data behavior

Version 0.7 adds a network transport and isolated storage model, not a new
RuneScape data source. The same Jagex Hiscores, Jagex ItemDB, Jagex graph, and
RuneScape Wiki providers remain authoritative.

Anonymous hosted calls can use public-source and deterministic tools. Optional
accounts persist only companion profiles in a private per-account SQLite file.
Public quest, training, Grand Exchange, and provider-cache data is shared across
accounts and retains the existing source timestamps, freshness states, and
transactional validation.

The hosted service never treats access tokens, HTTP metadata, model output, or
account storage as RuneScape facts. Remote transport errors cannot replace a
last valid public dataset.
