# RS3 Grand Exchange market data

Gielinor Companion uses public RuneScape 3 guide-price and historical sources.
It does not claim access to a live order book.

| Adapter                              | Data used                                                                                                         | Important limitation                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| RuneScape Wiki/Weird Gloop catalogue | Item ID, name/aliases, guide and previous price, buy limit, alchemy/store values, published volume and timestamps | Bulk public snapshot; fields may be absent. |
| Jagex ItemDB detail                  | Backward-compatible single-item metadata and current guide value                                                  | Guide value, not a guaranteed transaction.  |
| Jagex ItemDB graph                   | Up to 180 daily guide-price points and published average                                                          | Daily history, not intraday quotes.         |
| Weird Gloop `/exchange/history/rs/`  | Independent latest/history price and volume where published                                                       | Community API; volume may be missing.       |

The project never maps OSRS real-time high/low endpoints into RS3 results.

Each stored record carries source name/URL, provider timestamp, retrieval time
and content hash or revision where the contract supplies it. Provider
disagreement between Weird Gloop history and the independently retrieved Jagex
graph is measured explicitly and reduces source confidence above the versioned
threshold. The Jagex graph is also the explicit history fallback when the
community endpoint is unavailable. A malformed or suspiciously truncated
snapshot cannot replace the previous valid snapshot.

Fresh network data is labelled live public data. Valid retained data is labelled
cached or stale and includes its age. Offline mode prevents provider calls.
Unavailable values remain unavailable; no volume, buy limit, current price or
history point is fabricated.

References:

- [RuneScape Wiki API help](https://runescape.wiki/w/Help:APIs)
- [RuneScape Wiki GE API documentation](https://runescape.wiki/w/RuneScape:Grand_Exchange_Market_Watch/Usage_and_APIs)
- [Weird Gloop OpenAPI](https://api.weirdgloop.org/)
