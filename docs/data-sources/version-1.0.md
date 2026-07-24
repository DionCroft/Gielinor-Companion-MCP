# Version 1.0 data behavior

Version 1.0 adds no RuneScape data source and does not change provider priority.
It makes the existing validated contracts stable:

- public Jagex Hiscores;
- Jagex Grand Exchange ItemDB detail and graph endpoints;
- RuneScape Wiki quest, training, and Market Watch sources;
- deterministic, revisioned XP tables;
- local manual profile/quest/goal data.

Provider plugins must declare API version 1. Every result still passes the
shared runtime schema before it can reach core logic or replace cached data.
Malformed, empty, timed-out, rate-limited, or suspiciously truncated refreshes
retain the last valid record and return an explicit failure.

The generated MCP contract manifest changes no source or cache behavior.
Checksums, SBOMs, and release attestations describe software artifacts, not
RuneScape account data.
