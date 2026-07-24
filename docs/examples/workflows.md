# Example workflows

These examples work in the desktop dashboard or through a model/MCP client. A
model may phrase the explanation differently; the listed companion tools and
their validated results are the source of truth.

## Quest route

1. `create_player_profile` with a public display name and normal account mode.
2. `refresh_player_stats` for the returned profile UUID.
3. `refresh_quest_data` once if the local catalogue is empty.
4. `create_quest_route` for a target such as `Plague's End`.
5. `list_missing_quest_requirements` to separate quest, skill, and manual
   blockers.
6. `create_quest_shopping_list`, then `calculate_quest_shopping_cost`.
7. Update manual progress with `set_quest_status`.

Example prompt:

```text
Use Gielinor Companion to plan an ordered route to Plague's End for my selected
profile. Show missing skills, manual checks, source links, and a separately
priced shopping list. Do not assume my bank contents.
```

## Levelling plan

1. Refresh training data.
2. Call `create_levelling_plan` with the profile, skill, target level, strategy,
   budget, and hours per day.
3. Use `compare_training_methods` for alternatives and uncertainty.
4. Use `create_weekly_goal_plan` for a bounded schedule.

Example prompt:

```text
Create a balanced Mining plan to level 90 with two hours per day and a
20,000,000 GP budget. Keep unknown costs explicit.
```

## Grand Exchange research

1. `search_items` by name.
2. `get_item_price_summary` over `30d` or `180d`.
3. `compare_item_prices` for sourced analytics.
4. `value_item_list` for quantities.
5. `export_price_data` for JSON or CSV chart data.

Guide prices are delayed public values, not guaranteed buy/sell prices or profit
claims. No tool places a trade.

## Offline retained-data session

Set `GIELINOR_OFFLINE=true` before starting the local MCP server, or enable
retained-data mode in desktop settings. Deterministic calculations and retained
cache reads continue; provider refreshes return explicit offline errors. Return
offline mode to false before an intentional refresh.

## Local AI

Select Ollama or LM Studio in the desktop, discover a tool-capable model, and
ask one of the prompts above. Inspect the visible tool-activity panel. Only a
successful, validated tool envelope confirms a fact; model prose alone does
not.
