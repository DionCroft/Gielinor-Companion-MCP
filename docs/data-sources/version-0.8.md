# Version 0.8 overlay data behavior

Version 0.8 adds no remote RuneScape data provider.

The optional Alt1 app uses locally visible RuneScape pixels as a transient
observation source. The pinned upstream `alt1` library (`0.1.3`) locates and OCRs
the visible main chat. Results are labelled `Alt1 visible main chat · local OCR`.
Manual fallback text is separately labelled `Manual text · local analysis`.

Raw pixels and raw OCR lines are not stored or transmitted. Only redacted,
bounded signals exist in memory. Guide steps come from a player-supplied,
schema-versioned JSON pack and retain any HTTPS source URL supplied in that pack.

OCR and keyword matching are probabilistic:

- source text can be missed after RuneScape UI/font changes;
- dialogue outside the visible main chat is unsupported;
- a keyword match is a guide suggestion, not proof of game state;
- suspected quest completion always requires manual confirmation;
- confirmation is local to the overlay session and does not update a profile.

The normal Hiscores, ItemDB, graph, Wiki, SQLite, MCP, desktop, and hosted data
paths are unchanged and work with the overlay absent.
