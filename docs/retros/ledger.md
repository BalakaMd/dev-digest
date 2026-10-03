# Workflow retro ledger

One row per `/workflow-retro`, so multi-agent runs can be compared over time. Cost is `n/a` until
current per-model prices are verified (see the skill). Output tokens come from the session journals
and are likely under-counted for tool-heavy agents; compare them between runs, not against an invoice.

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
| 2026-10-03 | project-context-folder | 33 (all depth 1, 0 nested): 1 spec-creator, 1 planner, 17 implementer, 9 test-writer (2 stalled), 2 architecture-reviewer, 2 plan-verifier, 1 doc-writer | 3.7k fresh + 185.1M cache-read + 10.9M cache-write → 403k* | 94.5% | 19,016 s (5.3 h, includes human waits) | 0.58x (distorted by human waits and 2 stalls) | n/a | Toolchain pre-flight (node/pnpm/docker) in dev-flow Step 0, and split test-writer into ≤5 T-n per instance |
