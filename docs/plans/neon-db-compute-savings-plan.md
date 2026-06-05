# Neon DB Compute Savings Plan

## Summary

Reduce Neon compute usage by limiting unnecessary Postgres wake-ups from three sources: high-frequency Vercel crons, hot shipment/label ingestion writes, and manifest UI polling reads. Keep manifest correctness intact: Asendia manifests must still be created from durable, explicit `parcel_id` records in Postgres before evening manifest creation.

Use a phased rollout so low-risk savings ship first, then introduce durable buffering for shipment ingestion.

## Phase 1: Low-Risk Cron And UI Savings

- Restrict `vacier-latam-customs` cron to the confirmed operating window: `05:00-19:00 Europe/Amsterdam`, weekdays.
- Add route-level Amsterdam-time guards before any DB import/query, because Vercel cron is UTC-only and DST-sensitive.
- Require `CRON_SECRET` consistently for `vacier-latam-customs`.
- Add env soft guards:
  - `VACIER_LATAM_MAX_PAGES_PER_RUN`
  - `VACIER_LATAM_MAX_ORDERS_PER_RUN`
  - `VACIER_LATAM_MAX_SHIPHERO_CREDITS_PER_RUN`
- Reduce manifest console auto-refresh from `45s` to `5 min`, with a manual refresh button retained.
- Avoid loading heavy detail endpoints until their tab or selection is visible.
- Add response summaries so `/api/batches` does not re-query shipments multiple times per batch.

## Phase 2: Optimize Current DB Write Path

- Refactor Asendia shipment ingestion to reduce DB round trips:
  - replace `findShipmentByExternalId` plus `insertShipment` with an idempotent insert/upsert on `external_shipment_id`;
  - assign `batch_id` at insert time when possible;
  - increment batch count only after confirmed new shipment insert;
  - avoid duplicate batch count increments on repeated webhooks.
- Add or verify DB constraints/indexes:
  - unique `shipments.external_shipment_id`;
  - index for open batch lookup: `(status, operational_date, grouping_key, crm_id)`;
  - index for manifest lookup: `(batch_id, is_manifested)`.
- Keep Postgres as source of truth in this phase; no cache dependency yet.

## Phase 3: Durable Shipment Buffer For Daytime Traffic

- Add Upstash Redis or equivalent durable Redis-compatible cache for same-day Asendia shipment events.
- On Asendia Sync label success, write shipment events to Redis first:
  - key by `external_shipment_id` / `parcel_id` for idempotency;
  - store all fields needed for later DB insert and manifesting;
  - maintain per-operational-date/grouping counters for UI.
- Do not use process memory for shipment state.
- Keep fallback behavior: if Redis write fails, persist directly to Postgres so manifest data is never lost.
- Add a buffered event schema with:
  - `external_shipment_id`
  - `parcel_id`
  - `order_id`
  - `account_id`
  - `crm_id`
  - `sender_tax_code`
  - `shipping_method`
  - `tracking_number`
  - `label_url`
  - `created_at`
  - `operational_date`
  - `grouping_key`

## Phase 4: Flush Buffer Before Manifesting

- Add a cron/manual service to flush buffered shipments from Redis to Postgres in batches.
- Run flush before manifest creation, and also allow manual invocation.
- Flush behavior:
  - bulk upsert shipments by `external_shipment_id`;
  - create/find open batches per operational date/grouping;
  - assign `batch_id`;
  - recompute or increment `batches.shipment_count` safely;
  - mark flushed Redis records only after successful DB commit.
- Update manifest trigger to require buffer flush success for the operational date before closing batches.
- If flush fails, manifest trigger must fail closed and not create a partial manifest.

## Phase 5: UI Reads From Cache With DB Fallback

- Update manifest console APIs to read live daytime counts from Redis when buffer mode is enabled.
- UI response should merge:
  - Redis buffered shipment counts for unflushed current-day activity;
  - Postgres batch/manifest state for flushed and finalized records.
- Show a clear `dataSource` / `bufferStatus` in API responses for operators:
  - `db_only`
  - `cache_plus_db`
  - `cache_unavailable_db_fallback`
- Keep shipment search DB-backed for historical/finalized records; optionally search buffered current-day shipments by parcel/order/tracking from Redis.

## Phase 6: Monitoring And Rollout

- Add structured logs for:
  - `shipment_buffered`
  - `shipment_buffer_fallback_db`
  - `shipment_buffer_flush_started`
  - `shipment_buffer_flush_completed`
  - `shipment_buffer_flush_failed`
  - `manifest_blocked_unflushed_buffer`
- Roll out with flags:
  - `SHIPMENT_BUFFER_ENABLED=false`
  - `SHIPMENT_BUFFER_UI_READS_ENABLED=false`
  - `SHIPMENT_BUFFER_FLUSH_ENABLED=false`
- Rollout order:
  - deploy Phase 1 and Phase 2 first;
  - enable Redis buffering in dry-run/shadow mode;
  - compare Redis counts vs Postgres writes for one operational day;
  - enable buffered UI reads;
  - enable buffered DB flush;
  - only then reduce hot-path direct DB writes.
- Configure Neon:
  - scale-to-zero enabled;
  - minimum compute set conservatively, ideally `0.25 CU`;
  - autoscaling max capped during rollout;
  - Neon usage alerts enabled.

## Test Plan

- Unit tests:
  - Amsterdam business-hour cron guard across CET/CEST;
  - idempotent shipment upsert does not duplicate rows or counts;
  - Redis buffered event normalization and grouping key generation;
  - flush retries do not duplicate shipments;
  - manifest trigger blocks if buffer flush fails.
- Integration tests:
  - duplicate webhook produces one shipment and one batch count;
  - buffered shipments appear in UI counts before DB flush;
  - flushed shipments appear in DB and manifest flow;
  - Redis outage falls back to direct DB persistence.
- Verification commands:
  - `pnpm build`
  - existing manifest tests
  - LATAM customs tests
  - shipment/batching ingestion tests

## Assumptions

- Use durable Redis-compatible storage, preferably Upstash Redis, not in-memory cache.
- Do not remove Postgres from the manifest source of truth.
- Manifest creation remains based on explicit persisted `parcel_id` records.
- UI freshness can move from 45 seconds to 5 minutes plus manual refresh.
- If cache and DB disagree, manifest safety wins over cost savings.
