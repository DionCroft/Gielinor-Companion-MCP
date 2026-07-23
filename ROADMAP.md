# Roadmap

Each version must retain a working build. A version is complete only when its
affected code is documented, typed, linted, tested, and built successfully.

## 0.1 — Foundation (complete)

Strict monorepo, shared schemas, SQLite profiles/cache, public Hiscores, XP
calculations, Jagex ItemDB lookup, local stdio MCP, client examples, CI, and
project policies.

## 0.2 — Quest companion (complete)

Wiki-backed revision-aware quest sync, transactional validation, prerequisite
graph and cycle detection, manual progress, available quests, missing
requirements, routes, shopping lists, and quest MCP tools.

## 0.3 — Levelling planner (complete)

Structured training methods, time/XP/GP calculations, multi-stage fastest,
cheapest, balanced, and low-intensity plans, quest comparisons, budgets, and
weekly schedules.

## 0.4 — Grand Exchange intelligence (current)

Item search, historical data, moving averages, percentage changes, volatility,
volume where available, list/equipment valuation, charts, and freshness display.

## 0.5 — Standalone desktop and no-AI dashboard

Accessible React/Tauri UI for profiles, skills, quests, levelling, GE, shopping
lists, goals, settings, source health, and portable profile files.

## 0.6 — Local AI providers

Shared bounded tool-call runtime, Ollama and LM Studio adapters, multi-turn and
parallel tool calls, model selection, timeouts, validation, and setup guidance.

## 0.7 — Hosted MCP

Streamable HTTP service, optional authentication, isolated remote storage, rate
limits, health checks, deployment/privacy guides, and client capability notes.

## 0.8 — Optional read-only overlay

Only if technically and policy compliant: consent-driven visible-screen/Alt1
information with manual confirmation and no generated gameplay input.

## 0.9 — Extensibility and hardening

Provider plugin contract, more sources, migrations, offline behavior, profiling,
failure/load tests, threat model, accessibility audit, and contributor tooling.

## 1.0 — Stable public release

Stable MCP/profile contracts, migration guarantees, installers, npm package,
complete documentation, verifiable release artifacts where practical, security
and accessibility reviews, and release material.
