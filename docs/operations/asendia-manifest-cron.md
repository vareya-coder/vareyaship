# Asendia Manifest Cron Operations

## Endpoints

- Trigger: `GET /api/cron/manifest-trigger`
  - Secured with `Authorization: Bearer ${CRON_SECRET}`
  - Runs every 10 minutes (see `vercel.json`)
  - Behavior:
    - Waits until the daily trigger window opens (`MANIFEST_TRIGGER_TIME` in `MANIFEST_TRIGGER_TIMEZONE`)
    - Executes only once per operational day, tracked in DB
    - Evaluates OPEN batches
    - If now >= cutoff (env `CUTOFF_TIME` in `CUTOFF_TIMEZONE`), closes all today’s OPEN batches
    - Else closes batches by age (`BATCH_INTERVAL_HOURS`) or `SHIPMENT_THRESHOLD`
    - If `DRY_RUN_MANIFEST=y`, logs intended actions without mutating
    - Otherwise: sets batch → CLOSING, creates manifest (explicit parcel_ids), verifies, fetches PDF, sets batch → MANIFESTED

- Retention: `GET /api/cron/manifest-retention`
  - Secured with `Authorization: Bearer ${CRON_SECRET}`
  - Default schedule daily at 02:30 (see `vercel.json`)
  - Deletes manifest PDFs older than `RETENTION_DAYS` (default 30)

## Environment

- `CRON_SECRET` (required)
- `DRY_RUN_MANIFEST` (y/true to simulate)
- `CUTOFF_TIME` (default 17:00)
- `CUTOFF_TIMEZONE` (default Europe/Amsterdam)
- `MANIFEST_TRIGGER_TIME` (defaults to `CUTOFF_TIME`; accepts `HH:mm` or values like `7pm`)
- `MANIFEST_TRIGGER_TIMEZONE` (defaults to `CUTOFF_TIMEZONE`)
- `BATCH_INTERVAL_HOURS` (default 24)
- `SHIPMENT_THRESHOLD` (default 1000)
- `RETENTION_DAYS` (default 30)

Asendia REST:
- `ASENDIA_API_BASE_URL`
- `ASENDIA_SYNC_USERNAME`
- `ASENDIA_SYNC_PASSWORD`

Notifications (Resend):
- `RESEND_API_KEY`
- `RESEND_API_ENDPOINT` (optional, defaults to https://api.resend.com/emails)
- `NOTIFY_EMAIL_TO`
- `NOTIFY_EMAIL_FROM`

## Dry Run

- Set `DRY_RUN_MANIFEST=y`
- `manifest-trigger` will:
  - Log which batches would be closed and how many parcels would be manifested
  - Not update batches or call Asendia

## Logs (Axiom events)

- shipment_ingested
- batch_created
- batch_assigned
- batch_closed (CLOSING)
- manifest_triggered
- manifest_success / manifest_failed
- verification_result (matched/mismatch)
