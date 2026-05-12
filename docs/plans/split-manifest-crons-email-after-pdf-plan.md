# Split Manifest Creation and PDF Delivery Crons

## Context

Current deployed behavior uses one Vercel cron endpoint:

- `GET /api/cron/manifest-trigger`
- Schedule: `*/10 * * * *`

The route currently does both jobs:

1. After cutoff, it closes eligible batches and creates Asendia manifests from explicit `parcel_id` lists.
2. On later 10-minute invocations, it processes pending manifest PDFs, uploads them to UploadThing, and updates `manifests.document_url`.

Two production issues were observed:

- Success emails can be sent during manifest creation before the PDF exists, so the email contains `Manifest URL: not available`.
- The same cron runs every 10 minutes all day even though the operational need is a small fixed window after cutoff: one run to create manifests, then one later run to fetch/upload documents and send the useful email.

## Goals

- Send manifest success email only after `manifests.document_url` exists.
- Split manifest creation from PDF retrieval/upload/email delivery.
- Run only two scheduled manifest jobs per day after cutoff, approximately 5 minutes apart.
- Keep manifest creation based on an explicit list of `parcel_id`s.
- Keep ingestion, batching, manifesting, verification, and document storage DB-driven and independent of UI.
- Preserve idempotency so manual replays or duplicate cron invocations do not create duplicate manifests or duplicate success emails.

## Non-Goals

- No background worker or queue.
- No UI dependency.
- No implicit Asendia manifest inclusion.
- No broad redesign of batching or shipment ingestion.

## Proposed Design

### 1. Creation Cron

Keep the existing route path:

- `GET /api/cron/manifest-trigger`

Change its responsibility to only:

- Authorize request.
- Respect dry-run behavior.
- Check `hasReachedCutoff(...)`.
- Acquire the daily `manifest-trigger` cron lock.
- Evaluate batches for closing.
- Move eligible batches `OPEN -> CLOSING`.
- Create/recreate Asendia manifests from explicit `parcel_id` lists.
- Verify manifests if enabled.
- Mark succeeded shipments as manifested.
- Mark batches `MANIFESTED` when all shipments in the batch are manifested.
- Persist manifest records in a PDF-pending state.

Creation cron should not:

- Call `attemptInitialManifestPdfFetch(...)`.
- Call `processPendingManifestPdfs(...)`.
- Send `notifyManifestTriggerSuccess(...)`.

This means manifest creation success is represented in the DB, but no customer-facing success email is sent until document upload succeeds.

### 2. PDF Delivery Cron

Add a new route:

- `GET /api/cron/manifest-documents`

Its responsibility:

- Authorize request with the same `CRON_SECRET` pattern.
- Check `hasReachedCutoff(...)`.
- Acquire a separate daily lock, for example `manifest-documents`.
- Select pending manifests for the current operational date where:
  - `status in ('MANIFEST_CREATED', 'PDF_PENDING')`
  - `document_url is null`
  - `created_at` is inside the current operational-date window
- Fetch each manifest PDF from Asendia.
- Upload each PDF to UploadThing.
- Persist:
  - `status = 'UPLOADED'`
  - `document_url`
  - `pdf_ready_at`
  - attempt metadata
- Send success email only after `document_url` is available.

The email body should never render a success email with `Manifest URL: not available`.

### 3. Document Processing Result Contract

Update `processPendingManifestPdfs(...)` so callers can know what happened.

Suggested return shape:

```ts
type PendingManifestPdfProcessingResult = {
  processed: Array<{
    manifestId: string;
    batchId: number | null;
    success: boolean;
    documentUrl?: string;
    retryable?: boolean;
    failureReason?: string;
  }>;
};
```

The new document cron can use this to send one success email per successfully uploaded manifest.

### 4. Success Email Inputs

Move success notification triggering out of `manifest-trigger`.

For each uploaded manifest in the document cron:

- Load its batch summary from DB.
- Require `documentUrl` to be truthy.
- Call `notifyManifestTriggerSuccess(...)` with `manifestUrl: documentUrl`.

Optionally harden `notifyManifestTriggerSuccess(...)` itself by making `manifestUrl` required, or by returning/logging without sending when `manifestUrl` is missing. This prevents future call sites from reintroducing the current problem.

### 5. Cron Schedule

Update `vercel.json` from the 10-minute schedule to fixed daily schedules.

Required production local execution times:

- Manifest creation: `17:25 Europe/Amsterdam`
- Manifest PDF/upload/email: `17:30 Europe/Amsterdam`

Vercel cron schedules are UTC and do not directly support `Europe/Amsterdam` daylight-saving rules. Amsterdam is:

- `UTC+2` during CEST, so the UTC schedules are `15:25` and `15:30`.
- `UTC+1` during CET, so the UTC schedules are `16:25` and `16:30`.

Use DST-safe duplicate UTC schedules and let route-level guards / daily cron locks ignore the non-active seasonal duplicate:

```json
{
  "path": "/api/cron/manifest-trigger",
  "schedule": "25 15 * * *"
},
{
  "path": "/api/cron/manifest-documents",
  "schedule": "30 15 * * *"
},
{
  "path": "/api/cron/manifest-trigger",
  "schedule": "25 16 * * *"
},
{
  "path": "/api/cron/manifest-documents",
  "schedule": "30 16 * * *"
}
```

Keep the route-level cutoff guard. If the environment cutoff / trigger time is configured later than the cron execution time, the cron must be ignored for that day rather than creating manifests early.

Implementation detail: the route should check both:

- `hasReachedCutoff(now, flags.manifest_trigger_time, flags.manifest_trigger_timezone)`
- The current local time is inside the intended route window for that job, e.g. `17:25` for creation and `17:30` for document delivery, with a small tolerance for scheduler delay.

This prevents the seasonal duplicate UTC schedule from doing meaningful work one hour late.

### 6. Retry Policy

For the requested two-execution model:

- Creation cron does zero PDF fetch attempts.
- Document cron performs the PDF fetch/upload attempt once per day.
- If Asendia still returns 404/not-ready, keep `status = 'PDF_PENDING'`, log `manifest_pdf_retry`, and leave the record visible for manual recovery.

Optional safer variant:

- Allow manual invocation of `GET /api/cron/manifest-documents` to retry the same operational day if Asendia is delayed.
- Do not schedule it every 10 minutes.

### 7. Idempotency and Duplicate Email Protection

Current schema does not have a notification-sent column. To avoid duplicate success emails on manual retry, use one of these approaches:

Preferred:

- Add `success_notified_at timestamp` to `manifests`.
- Document cron sends success email only when:
  - `document_url is not null`
  - `success_notified_at is null`
- After successful notification attempt, set `success_notified_at`.

Minimal:

- Rely on the separate `manifest-documents` daily cron lock.
- This prevents duplicate scheduled sends, but manual retries after a partial failure could still send duplicate success emails.

Preferred approach is recommended.

### 8. Documentation Updates

Update:

- `docs/operations/asendia-manifest-cron.md`
- `README.md`

Document:

- Creation cron route and schedule.
- Document cron route and schedule.
- Expected execution order.
- Manual replay guidance.
- The rule that success email requires an UploadThing manifest URL.

### 9. Tests / Verification

Add or update focused tests where the current test setup allows:

- `manifestBatch` creates/verifies manifests without attempting PDF retrieval.
- `manifest-trigger` does not call success notification.
- `manifest-documents` uploads a PDF and sends success email with URL.
- `manifest-documents` does not send success email when PDF fetch fails or URL is missing.
- Duplicate document cron/manual invocation does not send duplicate success email when `success_notified_at` is already set.

Also run:

```bash
pnpm lint
pnpm test
```

If this repo has no working test command, at minimum run TypeScript/lint checks available in `package.json`.

## Implementation Steps

1. Add `success_notified_at` to `manifests` schema and migration.
2. Remove initial PDF fetch from `executeManifestLifecycle(...)`.
3. Remove pending PDF processing and success notification from `manifest-trigger`.
4. Add document-processing result data from `processPendingManifestPdfs(...)`.
5. Add `src/app/api/cron/manifest-documents/route.ts`.
6. Add repository/helper logic to load uploaded manifest batch summaries and mark success notification sent.
7. Harden `notifyManifestTriggerSuccess(...)` so success email is not sent without a URL.
8. Update `vercel.json` schedules.
9. Update operations docs and README.
10. Run checks and fix type/test failures.

## Open Decision Before Implementation

Resolved:

- Manifest creation cron: `17:25 Europe/Amsterdam`.
- Manifest document/upload/email cron: `17:30 Europe/Amsterdam`.

Remaining implementation detail:

- Use DST-safe UTC schedules in `vercel.json`.
- Add route-level local-time window guards so the inactive seasonal duplicate exits without work.
