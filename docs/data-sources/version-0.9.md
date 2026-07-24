# Version 0.9 data behavior

Version 0.9 adds no new RuneScape public-data source.

The built-in Jagex and RuneScape Wiki adapters are registered as one typed
plugin. Capability results pass the same shared runtime schemas before reaching
the unchanged core ports. Explicit priority determines the selected source;
fallback attempts and comparison disagreements remain visible to registry
callers and are never silently merged.

`GIELINOR_OFFLINE=true` permits retained Hiscores and GE cache entries, including
entries beyond normal stale expiry, without starting a request. It rejects
uncached reads and network-only quest/training/catalogue refreshes. Previously
validated repository snapshots remain usable.

Identical concurrent cache keys and HTTP URLs share in-flight work. Each caller
still receives its own validated result or independently readable HTTP response.
Provider health is process-local and records attempts, not player data.
