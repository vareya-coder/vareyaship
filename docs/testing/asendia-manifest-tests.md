# Suggested Unit Tests — Asendia Manifest

Focus on pure services to keep tests fast and deterministic.

## Batching

- buildGroupingKey
  - default flags OFF → returns null
  - enable_service_separation ON → includes shipping_method
  - enable_client_separation ON → includes account_id
  - both ON → `sm:...|acct:...`

- getOperationalDateISO
  - ensures date uses Europe/Amsterdam for rollover

- hasReachedCutoff
  - times before vs. after cutoff return false/true

## Batch lifecycle

- getOrCreateOpenBatch
  - returns existing OPEN batch for same grouping_key + operational_date
  - creates new batch when none exists

- evaluateBatchesForClosing
  - when cutoff reached → returns today’s batch ids
  - otherwise uses age and shipment_threshold

## Ingestion

- ingestAsendiaShipment (use a stub repo)
  - creates only once per `external_shipment_id` (idempotent)
  - assigns to the correct batch

## Manifest

- manifestBatch (with stubbed HTTP for Asendia)
  - dry-run skips network and DB writes
  - partial failure: marks success subset as manifested, leaves failures
  - verification mismatch: sets verification_status=mismatch and logs
  - on success: sets batch to MANIFESTED

## Notifications

- notify (with RESEND_API_KEY unset): logs only
- notify (with key): attempts HTTP POST to Resend; capture response handling

Implementation tips
- Prefer DI for repositories/HTTP to mock easily (e.g., pass functions into services).
- Keep tests at module/function granularity; e2e can be added later.

