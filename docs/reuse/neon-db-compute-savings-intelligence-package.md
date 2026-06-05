# Reusable Intelligence Package: Neon DB Compute Savings

## Session Type

- Technical architecture: analyzed Vercel, Neon, cron behavior, shipment ingestion, Redis buffering, DB write paths, and manifest safety.
- Operational workflow design: designed rollout phases, feature flags, cron windows, flush behavior, monitoring, and failure handling.
- AI/agent design: created reusable plans, execution workflows, and future-agent guidance for cost-safe architecture work.
- Risk analysis: identified compute-cost, data-loss, duplicate-ingestion, stale-UI, and manifest-integrity risks.

## 1. Executive Intelligence Summary

- The core problem was rising Neon compute usage from Vercel cron jobs, shipment-label endpoint DB writes, and UI polling.
- Initial concern focused on `vacier-latam-customs` cron frequency, but repo inspection showed shipment ingestion and UI reads may be larger cost drivers.
- Vercel Pro supports frequent cron schedules, so the issue was operational DB compute cost, not Vercel deployment validity.
- Neon compute cost is driven by active compute time; frequent DB touches can reduce the value of scale-to-zero.
- The Asendia manifest system has a hard invariant: manifests must be built from durable, explicit `parcel_id` records.
- In-memory caching was rejected because it risks losing shipment data required for manifest creation.
- Durable Redis-compatible buffering, preferably Upstash Redis, was selected as the safe cache layer.
- A phased plan was created and persisted in `docs/plans/neon-db-compute-savings-plan.md`.
- Code work introduced cron window guards, lower UI refresh frequency, reduced DB query fanout, idempotent shipment insert logic, optional Redis buffering, and a buffer flush endpoint.
- Buffering is disabled by default and controlled by feature flags.
- Manifest creation remains DB-driven; Redis is only a daytime buffer before DB flush.
- One DB migration adds a unique index on `shipments.external_shipment_id`; production duplicates must be checked before applying it.
- Recommended rollout is: direct DB savings first, then Redis shadow/trial, then UI cache reads, then full buffer+flush.
- Future work includes measuring Neon compute reduction and validating Redis flush correctness under production-like load.
- A later UI consistency issue showed that buffered shipment counts must be attached to their related DB batch, not only shown as top-level buffered totals.
- Repeated `/api/batches` 504s revealed a reusable anti-pattern: serverless functions should not perform one Redis REST request per buffered record; use batched reads such as `MGET` and avoid overlapping UI refreshes.

## 2. User Intent And Strategic Direction

### Explicit Intent

- Reduce Neon serverless compute-hour usage.
- Avoid overflowing Neon compute quota.
- Understand whether shipment/label endpoint DB writes should be optimized alongside cron jobs.
- Preserve UI freshness despite moving shipment records into cache.
- Persist and implement a phase-wise technical plan.
- Convert the session into reusable intelligence for future agentic systems.

### Inferred Intent

- Cost control matters, but not at the expense of manifest correctness.
- Phase-wise rollout is preferred over risky big-bang rewrites.
- Operational safety, observability, and rollback paths matter.
- Future AI agents should carry forward architectural context without repeated explanation.
- The user is building toward reusable founder/operator workflows, not one-off fixes.

### Uncertain Assumptions

- Whether Upstash Redis is already available in the Vercel project.
- Whether production `shipments.external_shipment_id` already has duplicates.
- Whether UI operators can tolerate 5-minute auto-refresh plus manual refresh.
- Whether weekday-only LATAM cron coverage is sufficient for business operations.

## 3. Important Context And Facts

### People And Stakeholders

- User/operator-founder: confirmed; owns architecture and cost-control decisions.
- Vacier: confirmed; customer/project context for LATAM customs automation.
- Warehouse/ShipHero users: likely; trigger label/shipment endpoints.
- Operations users: likely; use manifest UI and need shipment counts.

### Companies / Projects / Assets

- VareyaShip repo: confirmed; Next.js app deployed to Vercel.
- Neon: confirmed; serverless Postgres integrated via Vercel.
- Vercel Pro: confirmed.
- ShipHero: confirmed; order/fulfillment source.
- Asendia: confirmed; manifest/carrier flow.
- PostNL/Royal Mail: confirmed; label endpoints exist.
- Upstash Redis: recommended; not confirmed provisioned.

### Constraints

- Manifest must use explicit `parcel_id` list: confirmed.
- No data loss in shipment ingestion: confirmed.
- UI must not show misleading stale counts: confirmed.
- Neon compute must be reduced: confirmed.
- Redis buffering must be durable, not memory-based: confirmed.
- Buffer flags disabled by default: confirmed in implementation.
- Buffered shipments should carry `batch_id` so related entity counts remain consistent in the UI: confirmed by later implementation.

### Risks

- Unique index migration can fail if duplicate external shipment IDs exist.
- Redis outage must not lose shipment data; DB fallback is required.
- Flush failure must block manifesting.
- UI cache+DB merge can confuse operators if not surfaced.
- Cron window mistakes around DST require route-level Amsterdam-time guards.
- Redis REST fanout can cause `/api/batches` 504s as buffer size grows; batch Redis reads/writes are required for UI endpoints.
- Background browser tabs can amplify stale UI/failed request noise if polling overlaps or continues while hidden.

### Source Documents / Evidence

- `AGENTS.md`: architecture and business rules.
- `docs/plans/neon-db-compute-savings-plan.md`: compute savings plan.
- `vercel.json`: cron schedule configuration.
- `src/modules/shipments/*`: ingestion and buffer code.
- Vercel cron docs and Neon compute lifecycle docs were referenced during analysis.

## 4. Decisions Made

| Decision | Reasoning | Risk | What Would Change It | Next Action |
|---|---|---|---|---|
| Use phase-wise rollout | Reduces operational risk | Slower full savings | Severe urgent cost overrun | Roll out phases in order |
| Keep DB as manifest source of truth | Manifest correctness depends on durable parcel IDs | More DB writes than pure cache | A transactional durable event store replaces DB | Keep manifest DB-driven |
| Use durable Redis buffer, not memory | Survives serverless restarts | Adds Redis dependency | Redis not approved/available | Provision Upstash |
| Disable buffer by default | Safe deploy without credentials | No hot-path DB savings until enabled | Operator chooses aggressive rollout | Enable flags gradually |
| Flush before manifest creation | Ensures DB has explicit parcel IDs | Flush failure blocks manifest | Business accepts partial manifesting, unlikely | Monitor flush result |
| Add unique shipment idempotency index | Prevent duplicate rows/counts | Migration fails on existing duplicates | Duplicates cannot be cleaned safely | Run duplicate SQL first |
| Reduce UI auto-refresh to 5 min | Cuts DB polling | Less real-time UI | Operators need live dashboard | Use manual refresh/cache reads |
| Add LATAM cron window and caps | Limits compute and ShipHero use | Delayed processing outside window | Weekend/24h ops required | Adjust env/window |
| Create/resolve DB batch before buffering shipment | Keeps UI entity relationships consistent while avoiding per-shipment DB writes | Adds a small DB touch per batch grouping | If batch count is too high or DB wake-up remains too costly | Store `batch_id` in Redis shipment records |
| Use batched Redis reads for buffered UI data | Prevents `/api/batches` 504s from one REST call per shipment | Larger single Redis payload | If payload grows too large | Maintain per-date indexes/summaries |
| Avoid overlapping/background UI refreshes | Reduces repeated failed requests and stale-error churn | UI may refresh less while hidden | If real-time background monitoring is required | Add explicit foreground refresh on tab visibility |

## 5. Assumptions And Hypotheses

### Hot Shipment Writes Are A Major Neon Compute Driver

- Why it matters: reducing cron alone may not control compute hours.
- Evidence supporting: label path wrote to `shipments` and `batches` on each Asendia label call.
- Missing evidence: actual Neon query/activity logs by endpoint.
- Validation: compare Neon active time before/after buffering or DB-write reduction.
- Kill criteria: Neon compute remains high when shipment traffic is low.

### UI Polling Contributes Materially To DB Wake-Ups

- Why it matters: UI refresh can keep Neon active even without shipment writes.
- Evidence supporting: UI called multiple DB-backed APIs every 45 seconds.
- Missing evidence: dashboard open-session frequency.
- Validation: track DB calls from `/api/batches`, `/api/shipments`, `/api/manifests`.
- Kill criteria: UI is rarely open and DB activity does not correlate.

### Once-Daily Pre-Manifest Flush Is Sufficient

- Why it matters: maximizes compute savings.
- Evidence supporting: shipment data is mainly needed in evening for manifesting.
- Missing evidence: operational need for mid-day DB visibility/search.
- Validation: run buffer trial and compare operator needs.
- Kill criteria: ops require DB-backed shipment search during the day.

### Redis Fallback To DB Preserves Reliability

- Why it matters: avoids data loss if cache fails.
- Evidence supporting: implementation falls back to `persistAsendiaShipment`.
- Missing evidence: production Redis failure-mode test.
- Validation: simulate bad Redis credentials locally/staging.
- Kill criteria: fallback causes unacceptable latency or errors.

### Batched Redis Access Is Required For Serverless UI Endpoints

- Why it matters: one Redis REST request per buffered shipment can exceed Vercel function time limits and return 504.
- Evidence supporting: `/api/batches` 504s appeared while Redis had 147 buffered shipments and the code performed sequential per-key `GET`s.
- Missing evidence: exact Vercel function duration logs for each failed request.
- Validation: compare `/api/batches` latency before/after replacing per-key `GET` with `MGET`.
- Kill criteria: 504s continue after MGET/no-overlap changes, indicating DB query fanout or Redis scan itself is the bottleneck.

### Related Entity Consistency Matters More Than Top-Level Cache Totals

- Why it matters: operators reason in terms of batches, not only total shipments.
- Evidence supporting: UI showed buffered shipment totals but no related batch rows, creating operational confusion.
- Missing evidence: complete operator UI acceptance test.
- Validation: buffered shipments appear under the correct Batch Monitor row before DB shipment flush.
- Kill criteria: batch creation during buffering produces too many DB writes or incorrect grouping.

## 6. Reusable Mental Models

### Manifest Safety Before Cost Saving

- Use when: optimizing systems tied to carrier/legal/financial records.
- How it works: identify non-negotiable source-of-truth invariants before caching.
- Prevents: losing parcel IDs or creating incomplete manifests.
- Prompt: `Before optimizing cost, identify the data that must remain durable and the business rule that must never be weakened.`

### Phase Before Rewrite

- Use when: infrastructure cost fixes touch production workflows.
- How it works: ship low-risk savings first, gate risky improvements.
- Prevents: big-bang production regressions.
- Prompt: `Break this into deployable phases with feature flags, rollback points, and validation after each phase.`

### Cache Is Not State Unless Durable

- Use when: considering caching writes.
- How it works: distinguish view cache, write buffer, and source of truth.
- Prevents: treating ephemeral memory as operational data.
- Prompt: `Classify each cached item as display-only, recoverable, or mission-critical; require durable storage for mission-critical data.`

### Fail Closed On Irreversible Actions

- Use when: creating manifests, payments, exports, or submissions.
- How it works: if prerequisite sync fails, block the action instead of proceeding partially.
- Prevents: partial carrier manifests.
- Prompt: `For each irreversible step, define prerequisites and fail-closed behavior.`

### Cost Guardrails As Runtime Policy

- Use when: external APIs or serverless DB costs can spike.
- How it works: add max pages/orders/credits/window flags.
- Prevents: accidental runaway jobs.
- Prompt: `Add soft caps that can be changed by env without redeploying.`

### Preserve Relationship Semantics In Cache

- Use when: caching child entities that operators view through parent entities.
- How it works: create or resolve the parent identity first, then store that parent ID on cached child records.
- Prevents: top-level counts that cannot be reconciled with grids, filters, or operational actions.
- Prompt: `When moving records into cache, identify their parent entities and store stable parent IDs so the UI can preserve relationships.`

### Avoid Serverless Fanout Loops

- Use when: reading many cached records from REST-backed Redis/KV inside one serverless request.
- How it works: prefer `MGET`, indexed sets, summaries, or paged reads over one network call per item.
- Prevents: 504s, stale UI, and hidden cost from many external calls.
- Prompt: `Scan this endpoint for per-record external calls and replace them with batched or pre-aggregated reads.`

## 7. Reusable Workflows

### DB Compute Reduction Workflow

- Trigger: serverless DB compute usage rising.
- Inputs: deployment config, DB access paths, cron schedules, UI polling, logs.
- Process:
  1. Identify all DB-touching endpoints.
  2. Separate reads, writes, cron jobs, and UI polling.
  3. Find hot paths and redundant queries.
  4. Add low-risk guards first.
  5. Add durable buffering only for safe workflows.
  6. Validate with build/tests and usage metrics.
- Outputs: cost plan, flags, code changes, rollout guide.
- Failure modes: cache data loss, stale UI, migration conflicts.
- Review checkpoints: source-of-truth invariant, fallback behavior, migration safety.

### Shipment Buffer Rollout Workflow

- Trigger: hot shipment writes keep DB active.
- Inputs: shipment schema, buffer provider, manifest cutoff time.
- Process:
  1. Add disabled buffer code.
  2. Enable buffer write trial.
  3. Create/resolve DB batch IDs before buffering and store `batch_id` on cached shipments.
  4. Compare buffer vs DB counts and verify batch-level UI consistency.
  5. Enable UI buffered counts with batched Redis reads.
  6. Enable flush before manifest.
  6. Monitor failures.
- Outputs: reduced daytime DB writes.
- Failure modes: Redis outage, flush failure, duplicate shipments, cache counts detached from batches, Redis REST fanout causing 504s.
- Review checkpoints: DB fallback, idempotency index, manifest block on flush failure.

### Cache-Aware UI Consistency Workflow

- Trigger: UI shows cache totals that do not reconcile with parent grids or entity details.
- Inputs: cached child records, parent entity schema, UI summary endpoint, cache keys.
- Process:
  1. Identify the parent entity users expect to see.
  2. Ensure cached child records include stable parent IDs.
  3. Merge cached and persisted children by parent ID in the API response.
  4. Display both total and cached portions in the UI.
  5. Use batched cache reads and skip overlapping refreshes.
  6. Validate totals, filters, and detail views agree.
- Outputs: consistent dashboard counts and fewer stale/error states.
- Failure modes: missing parent IDs, legacy cache records, one-request-per-record fanout, overlapping refreshes.
- Review checkpoints: parent ID presence, cache read complexity, fallback display state.

### Future Agent Implementation Workflow

- Trigger: user says `implement the plan`.
- Inputs: plan file, repo, constraints.
- Process:
  1. Read plan and relevant code.
  2. Implement safest phases first.
  3. Keep risky features behind flags.
  4. Run focused tests.
  5. Run production build.
  6. Summarize flags, migration caveats, and rollout.
- Outputs: code, verification, rollout instructions.

## 8. Agentic System Design

| Agent | Purpose | Inputs | Tools | Outputs | Autonomy Level | Human Review Needed |
|---|---|---|---|---|---|---|
| Architecture Orchestrator | Owns phased technical direction | Repo, plan, constraints | File search, code review | Implementation plan | L2 | Before risky changes |
| Cost Analyst Agent | Finds DB/cron/API cost drivers | Logs, config, code paths | Search, metrics | Cost-risk map | L2 | For assumptions |
| DB Safety Agent | Reviews schema/migrations/idempotency | Schema, migrations | SQL, diff review | Migration risk memo | L2 | Always before prod DB migration |
| Manifest Integrity Agent | Protects parcel/manifest invariants | `AGENTS.md`, manifest code | Code analysis | Safety checklist | L2 | Before manifest changes |
| Implementation Agent | Modifies repo behind flags | Approved plan | Code tools, tests | PR/code changes | L3 | Before merge/deploy |
| Rollout Agent | Creates env and deployment checklist | Flags, Vercel/Neon setup | Docs, dashboards | Rollout runbook | L2/L3 | Before production enablement |
| Memory Capture Agent | Extracts reusable intelligence | Chat/session artifacts | Summarization | Memory package | L1 | Before storing long-term memory |

## 9. Skills To Create

### `serverless-db-cost-audit`

- Purpose: find DB compute drivers in serverless apps.
- Invoke when: Neon/Supabase/PlanetScale cost rises.
- Inputs: repo path, DB client, cron config, UI routes.
- Procedure: map DB calls, classify hot paths, identify redundant reads/writes, propose phased reductions.
- Output: cost-driver report and implementation plan.
- Checklist: includes cron, UI polling, write paths, migrations, fallbacks.
- Guardrails: do not recommend non-durable cache for critical records.
- Example invocation: `Run serverless-db-cost-audit on this repo and produce phased savings plan.`

### `durable-buffer-design`

- Purpose: design Redis/KV buffering safely.
- Invoke when: writes can be delayed but not lost.
- Inputs: event schema, flush timing, source-of-truth rules.
- Procedure: define buffer keys, fallback, flush, idempotency, UI merge.
- Output: buffer architecture and rollout flags.
- Guardrails: require fail-closed behavior for irreversible downstream actions.

### `cache-ui-consistency-review`

- Purpose: verify that cached records still reconcile with related DB entities in dashboards.
- Invoke when: moving hot-path records from DB to Redis/KV while preserving operational UI.
- Inputs: cache record schema, parent DB schema, UI response shape, sample counts.
- Procedure: check parent IDs, merge rules, stale states, batched reads, and filter/detail consistency.
- Output: UI consistency review and required API changes.
- Guardrails: do not show top-level cache totals without a way to relate them to operational parent entities.

### `serverless-cache-fanout-audit`

- Purpose: detect serverless endpoints that perform one external cache/API call per record.
- Invoke when: Vercel/Netlify/serverless endpoints return 504s or stale UI after adding cache reads.
- Inputs: endpoint code, cache access module, observed buffer sizes, function limits.
- Procedure: identify loops over keys, replace with `MGET`/bulk reads/summaries, add no-overlap UI refresh guards.
- Output: fanout risk report and batching plan.
- Guardrails: keep payload size and legacy-record upgrade paths bounded.

### `migration-risk-check`

- Purpose: review DB migrations for production risk.
- Invoke when: adding indexes/constraints.
- Inputs: migration SQL, current schema, data-risk query.
- Output: preflight SQL, rollback notes, deploy order.
- Guardrails: always check duplicates before unique indexes.

### `agentic-session-capture`

- Purpose: convert work sessions into reusable intelligence.
- Invoke when: a session produced decisions, workflows, or architecture.
- Inputs: transcript, artifacts, decisions.
- Output: reusable intelligence package.
- Guardrails: separate confirmed facts from inferred assumptions.

## 10. Prompt Library

### Master Continuation Prompt

```text
You are continuing work on the VareyaShip repo. Preserve the core invariant: Asendia manifests must be created from durable, explicit parcel_id records in Postgres. Optimize Neon compute cost without risking shipment/manifest data loss. Read docs/plans/neon-db-compute-savings-plan.md, inspect current code, then propose or implement the next safest rollout step with tests and migration caveats.
```

### Research Prompt

```text
Research the current repo and identify all paths that wake or write to the database. Classify them as cron, UI polling, webhook/label hot path, manual operator action, or migration. Rank by likely Neon compute impact and propose low-risk reductions first.
```

### Critique / Devil's Advocate Prompt

```text
Review this cost-saving architecture as if it could cause lost shipments or partial manifests. Identify every path where cache, DB, cron, or UI state can diverge. For each risk, propose fail-closed behavior, monitoring, and rollback.
```

### Opportunity Evaluation Prompt

```text
Evaluate whether a durable cache/buffer is worth adding here. Compare direct DB writes, Redis buffering, event queue, and external scheduler. Score each option on cost reduction, operational safety, complexity, observability, and rollback.
```

### Implementation Planning Prompt

```text
Create a decision-complete implementation plan for reducing DB compute. Include phases, files likely touched, flags, migrations, test cases, rollout order, and production preflight checks. Do not weaken manifest parcel_id durability.
```

### Risk Review Prompt

```text
Given this migration and feature-flag rollout, list production risks before deploy. Include data duplication, stale UI, failed buffer flush, Redis outage, cron auth, DST schedule, and Neon migration failure.
```

### Stakeholder Communication Prompt

```text
Draft an operator-facing explanation of the Neon compute savings changes: what changes, what remains safe, what flags control rollout, what operators should monitor, and what to do if manifest creation is blocked.
```

### Agent Handoff Prompt

```text
Handoff: Current work implements Neon compute savings in VareyaShip. Buffering is optional and disabled by default. Before production migration, check duplicates in shipments.external_shipment_id. Before full buffer mode, configure Upstash Redis and validate flush. Continue from docs/plans/neon-db-compute-savings-plan.md.
```

### Memory Extraction Prompt

```text
Extract reusable project memory from this session. Separate permanent user preferences, VareyaShip-specific facts, decisions, risks, and do-not-store items. Mark each as confirmed, inferred, or uncertain.
```

### Cache UI Consistency Prompt

```text
Review this cached-data UI flow. Identify every cached child record that must reconcile with a parent DB entity. Ensure cached records store stable parent IDs, API responses merge cache+DB by parent, and the UI shows totals that agree across top cards, grids, filters, and detail panels.
```

### Serverless 504 Fanout Debug Prompt

```text
Investigate repeated 504s in this serverless endpoint. Look for loops that perform one external Redis/API/DB call per record, overlapping frontend polling, background-tab refresh behavior, and stale UI state after failed requests. Propose batched reads, request de-duplication, and bounded fallback behavior.
```

## 11. Memory Candidates

### Permanent User Memory

- Prefers phase-wise plans before risky implementation: store; recurring working style.
- Cares about cost control but not at the expense of correctness: store; strategic principle.
- Wants future agents to capture reusable operating intelligence: store; recurring meta-workflow.
- Values direct technical critique and risk identification: store; review preference.
- Prefers durable, auditable systems over fragile shortcuts: store; inferred but strongly supported.

### Project Memory

- VareyaShip manifest invariant: explicit parcel IDs only; store as critical.
- Neon compute cost is a current active constraint; store as project-specific.
- Vercel Pro is used; store as deployment fact.
- Shipment buffer flags exist and default off; store as implementation fact.
- Need duplicate check before unique index migration; store as production rollout fact.
- UI refresh moved to 5 minutes plus manual refresh; store as product behavior.
- Redis/Upstash not confirmed provisioned; store as open dependency.
- Buffered shipment records should include `batch_id`; UI must merge buffered counts into DB batch rows, not only top-level buffered metrics.
- `/api/batches` must avoid per-shipment Redis REST fanout; use batched reads and prevent overlapping/background refreshes.

### Do-Not-Store

- Actual secrets, tokens, DB URLs, API keys.
- Temporary local build warning details unless recurring.
- Speculative assumptions about exact operator behavior, except as uncertain project notes.

## 12. Context Pack For Future Agents

```text
Project: VareyaShip, a Next.js/Vercel app integrating ShipHero, Asendia, PostNL, Royal Mail, Neon Postgres, and manifest automation.

Critical invariant: Asendia manifests must be created from durable, explicit parcel_id records in Postgres. Never rely on implicit batching or in-memory shipment state.

Recent work: Created and implemented docs/plans/neon-db-compute-savings-plan.md. Added LATAM cron time-window guards, soft run caps, reduced manifest UI polling, optimized /api/batches shipment reads, added idempotent shipment insert path, added optional Upstash Redis shipment buffer and flush endpoint, and added migration 0010 for unique shipments.external_shipment_id.

Flags: SHIPMENT_BUFFER_ENABLED, SHIPMENT_BUFFER_UI_READS_ENABLED, SHIPMENT_BUFFER_FLUSH_ENABLED default false. Full buffer mode requires UPSTASH_REDIS_REST_URL/TOKEN and validation. Buffered records should carry batch_id so UI counts reconcile to DB batch rows. Avoid Redis REST fanout in UI endpoints; use MGET/bulk reads and prevent overlapping refreshes.

Before production migration: run duplicate query on shipments.external_shipment_id. Before full buffer mode: test Redis fallback and flush. Manifest trigger must fail closed if buffer flush fails.

Preferred style: evidence from repo first, direct risk analysis, phase-wise implementation, explicit rollout flags, tests/build verification.
```

## 13. Governance, Controls, And Red Lines

- Do not weaken the manifest rule: explicit persisted `parcel_id` list only.
- Do not use in-memory cache for shipment data needed for manifests.
- Do not enable buffer mode in production without Redis credentials and flush validation.
- Do not apply unique index migration before checking duplicates.
- Do not let manifest creation proceed after buffer flush failure.
- Do not hide stale/cache fallback states from operators.
- Do not show cached shipment totals without reconciling them to related batches.
- Do not add per-record Redis REST calls inside serverless UI endpoints; use batched reads or summaries.
- Require human approval before production env flag changes.
- Require human approval before applying migrations.
- Require evidence before claiming cost savings; compare Neon active compute before/after.
- Treat carrier/API calls and DB migrations as high-risk actions.
- If uncertain, fail closed for manifesting and fail open to DB for shipment ingestion.

## 14. Review And Quality Culture

The user values:

- Direct identification of actual bottlenecks, not just the first suspected issue.
- Repo-grounded reasoning.
- Practical phased implementation.
- Clear flags and rollback paths.
- Safety invariants stated explicitly.
- Tests and build verification.
- Migration caveats before production deployment.

Review checklist:

```text
1. Did the agent inspect the repo before proposing?
2. Did it identify source-of-truth invariants?
3. Did it separate build/deploy problems from runtime cost problems?
4. Did it avoid fragile in-memory state?
5. Did it add feature flags for risky behavior?
6. Did it define fallback and fail-closed behavior?
7. Did it run focused tests and production build?
8. Did it state migration preflight checks?
9. Did it distinguish confirmed facts from assumptions?
10. Did cache-backed UI data reconcile top cards, grids, filters, and detail views?
11. Did serverless cache reads avoid per-record external call fanout?
12. Did it leave future agents with reusable context?
```

## 15. Improvement Loop

- Capture Neon compute before/after each rollout phase.
- Log discrepancies between Redis buffered counts and DB flushed counts.
- Track failed buffer writes, DB fallbacks, and flush failures.
- Update `docs/plans/neon-db-compute-savings-plan.md` after production learnings.
- Promote stable rollout steps into an SOP.
- Create a skill for serverless DB cost audits.
- Store decisions and invariants in project memory.
- Prevent context decay by adding a short current-architecture block to future planning docs.

Improvement metrics:

- Neon compute hours per day.
- Number of DB writes during daytime label traffic.
- Number of UI DB reads per hour.
- Buffer flush success rate.
- Duplicate shipment count.
- Manifest mismatch rate.
- Operator-reported freshness issues.

## 16. Next Action Plan

| Action | Owner | Priority | Dependency | Expected Output |
|---|---|---:|---|---|
| Run duplicate SQL for `shipments.external_shipment_id` | Human/operator | P0 | DB access | Duplicate report |
| Resolve duplicates if any | Human + agent | P0 | Duplicate report | Safe migration state |
| Apply `0010_neon_compute_savings.sql` | Human/operator | P0 | Duplicate cleanup | Unique index live |
| Deploy direct DB savings with buffer flags off | Human/operator | P0 | Build passing | Lower cron/UI DB pressure |
| Configure Neon alerts | Human/operator | P0 | Neon dashboard | Compute guardrails |
| Provision Upstash Redis | Human/operator | P1 | Provider decision | Redis credentials |
| Enable buffer write trial | Human/operator | P1 | Upstash credentials | Redis write validation |
| Compare Redis vs DB counts | Agent/operator | P1 | Trial data | Consistency report |
| Enable UI buffered counts | Human/operator | P2 | Count validation | Operator-visible buffer state |
| Enable full flush mode | Human/operator | P2 | Successful dry run | Daytime DB write reduction |
| Create rollout SOP | Agent | P2 | Production results | Markdown runbook |
| Monitor `/api/batches` latency after MGET/no-overlap fix | Agent/operator | P1 | Deployment | 504 regression report |
| Validate batch-level buffered counts in UI | Agent/operator | P1 | Buffered traffic | Consistency confirmation |

## 17. Artifacts To Generate

| Artifact | Purpose | Audience | Filename | Format |
|---|---|---|---|---|
| Neon compute rollout SOP | Production enablement | Operator/agent | `docs/operations/neon-compute-savings-rollout.md` | Markdown |
| Shipment buffer runbook | Explain flags, flush, fallback | Ops/dev | `docs/operations/shipment-buffer-runbook.md` | Markdown |
| Migration preflight checklist | Avoid unique-index failure | Dev/operator | `docs/db/shipment-idempotency-migration-checklist.md` | Markdown |
| Cost monitoring dashboard spec | Track Neon improvements | Founder/operator | `docs/operations/neon-cost-dashboard-spec.md` | Markdown |
| Agent handoff memo | Future continuation | AI agents | `docs/agents/neon-compute-savings-handoff.md` | Markdown |
| Redis buffer test plan | Validate production readiness | Dev/QA | `docs/testing/shipment-buffer-tests.md` | Markdown |
| Stakeholder brief | Explain changes non-technically | Client/internal ops | `docs/briefs/neon-compute-savings-brief.md` | Markdown |

## Final Extraction

### Top 5 Reusable Intelligence Assets

1. Serverless DB compute audit workflow.
2. Durable shipment buffer architecture.
3. Manifest safety invariant: explicit durable parcel IDs.
4. Phase-wise rollout model with feature flags.
5. Agent handoff/context pack for VareyaShip.
6. Cache-aware UI consistency model for parent/child operational entities.
7. Serverless cache fanout avoidance rule.

### Top 5 Things Future Agents Must Remember

1. Never compromise explicit `parcel_id` manifesting.
2. Neon compute savings must be measured, not assumed.
3. Redis buffer is optional and disabled by default.
4. Unique shipment ID migration requires duplicate precheck.
5. UI freshness and DB cost must be balanced transparently.
6. Buffered shipments must remain associated with their DB batch.
7. Redis REST reads must be batched for UI endpoints.

### Top 5 Risks Of Misusing This Context

1. Enabling buffer mode without Redis credentials or flush validation.
2. Treating Redis as final source of truth for manifests.
3. Applying the unique index while duplicates exist.
4. Assuming all cron reductions are safe without business-window confirmation.
5. Hiding cache fallback/staleness from operators.
6. Showing buffered totals that cannot be traced to batches.
7. Creating serverless 504s through one-cache-call-per-record fanout.

### Single Best Next Step

Run the duplicate check on `shipments.external_shipment_id`, clean up any duplicates, then apply the idempotency migration before enabling any shipment buffer flags.
