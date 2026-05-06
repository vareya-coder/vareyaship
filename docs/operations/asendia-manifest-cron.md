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
    - Does not automatically retry pre-existing `CLOSING` batches
    - If `DRY_RUN_MANIFEST=y`, logs intended actions without mutating
    - Otherwise: sets batch → CLOSING, creates manifest (explicit parcel_ids), optionally verifies, fetches PDF, sets batch → MANIFESTED

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
- `ENABLE_MANIFEST_VERIFICATION` (default true; set false to skip `GET /api/manifests/{id}/parcels`)
- `ASENDIA_MANIFEST_PARCELS_PAGE_SIZE` (default 250)
- `ASENDIA_MANIFEST_PARCELS_MAX_PAGES` (default 50)
- `MANIFEST_ENABLED_CRM_IDS` (optional comma-separated or JSON list; omit or leave empty to process all CRM IDs)

Asendia REST:
- `ASENDIA_API_BASE_URL`
- `ASENDIA_SYNC_USERNAME`
- `ASENDIA_SYNC_PASSWORD`

Notifications (Resend):
- `RESEND_API_KEY`
- `RESEND_API_ENDPOINT` (optional, defaults to https://api.resend.com/emails)
- `MANIFEST_NOTIFICATION_EMAIL_TO`
- `MANIFEST_NOTIFICATION_EMAIL_FROM`
- `MANIFEST_NOTIFICATION_TIMEZONE` (optional, defaults to Europe/Amsterdam)

## Dry Run

- Set `DRY_RUN_MANIFEST=y`
- `manifest-trigger` will:
  - Log which batches would be closed and how many parcels would be manifested
  - Not update batches or call Asendia

## Manual Recovery

- Recreate an existing Asendia manifest on demand:

```bash
pnpm manifest:recreate --manifest-id <manifest-id>
```

- The command calls `PUT /api/manifests/{manifestId}` against Asendia Sync using the existing REST auth env vars.
- Use this only as a manual recovery path when you intentionally want Asendia to rebuild a manifest for an existing manifest ID.

- Run the full manual batch recovery flow:

```bash
pnpm manifest:manual-process --batch-id <batch-id> [--manifest-id <manifest-id>]
```

- This command:
  - loads the batch from DB
  - creates a manifest if none exists yet
  - recreates the existing manifest if one already exists
  - verifies parcels, fetches the manifest document, uploads it to UploadThing, and reconciles local DB state
  - leaves the batch in a stable final state so a later cron run does not try to reprocess the same batch
  - stays quiet on email notifications; it only logs to console/Axiom

## Logs (Axiom events)

- shipment_ingested
- batch_created
- batch_assigned
- batch_closed (CLOSING)
- manifest_triggered
- manifest_success / manifest_failed
- verification_result (matched/mismatch)
