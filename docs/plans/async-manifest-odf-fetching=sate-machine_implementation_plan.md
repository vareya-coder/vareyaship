# Asynchronous Manifest PDF Fetching State Machine

This plan outlines the redesign of the Asendia manifest document fetching process into a production-grade asynchronous state machine workflow.

## Proposed Changes

### Database

#### [MODIFY] `src/lib/db/schema.ts`
Add new columns to the `manifests` table to support the state machine:
- `status`: Semantics updated to include `MANIFEST_CREATED`, `PDF_PENDING`, `UPLOADED`, `FAILED`.
- `pdf_retry_count`: `integer('pdf_retry_count').default(0)`
- `pdf_last_attempt_at`: `timestamp('pdf_last_attempt_at')`
- `pdf_next_retry_at`: `timestamp('pdf_next_retry_at')`
- `pdf_ready_at`: `timestamp('pdf_ready_at')`
- `pdf_failure_reason`: `text('pdf_failure_reason')`
Add an index on `(status, pdf_next_retry_at)` for efficient cron polling.

### Manifesting Module (Services)

#### [MODIFY] `src/modules/manifesting/manifest.service.ts`
- Update `manifestBatch` to persist the manifest with `status = 'PDF_PENDING'`.
- After creating the manifest, attempt to fetch the PDF *once* synchronously (Try 1).
  - If success: `status = 'UPLOADED'`, persist `document_url`.
  - If 404: keep `status = 'PDF_PENDING'`, compute `pdf_next_retry_at` to be exactly **8 minutes** from now, and set `pdf_retry_count = 1`.

#### [MODIFY] `src/modules/manifesting/document.service.ts`
- Refactor document service logic:
  - `fetchManifestPdf(manifestId)`: Uses hardened axios logic (e.g., `responseType='arraybuffer'`, `validateStatus`) to explicitly handle 200 vs 404 vs 5xx.
  - `uploadManifestPdf(pdfBuffer, manifestId)`: Leverages existing upload logic.
  - `processPendingManifestPdfs()`: Core polling logic. 
    - **Filter**: Fetches pending manifests where `pdf_next_retry_at <= now()`.
    - **Today Only check**: ONLY processes manifests created during the *current operational day* (to prevent retrying ancient manifests that ops have already handled manually).
    - Iterates through them, calling fetch and upload, and handles state transitions.

#### [NEW] `src/modules/manifesting/retry.utils.ts`
- Implement `computeManifestRetryDelay(retryCount: number)`:
  - We allow exactly **3 total attempts**. To ensure we do not miss the next 10-minute cron run by mere seconds, we will use an **8-minute** spacing delay.
  - Try 1 (immediate). If fail -> schedule next for +8 mins, retryCount = 1.
  - Try 2 (next cron). If fail -> schedule next for +8 mins, retryCount = 2.
  - Try 3 (subsequent cron). If fail -> immediately mark as `FAILED`.

### Cron Job Coexistence Strategy

#### [MODIFY] `src/app/api/cron/manifest-trigger/route.ts`

We will inject `processPendingManifestPdfs()` **after the cutoff check** but **before the daily lock**:

```typescript
// 1. Exit if we haven't reached the cutoff time yet.
if (!hasReachedCutoff(now, flags.manifest_trigger_time, ...)) {
  return NextResponse.json({ ... });
}

// 2. NEW: Process any pending PDFs right now (today's manifests only).
await processPendingManifestPdfs(operationalDate);

// 3. Existing Daily Lock
const runState = await acquireDailyCronRun(MANIFEST_TRIGGER_JOB, operationalDate);

// 4. If lock says 'completed', exit early.
if (runState.state === 'completed') {
  return NextResponse.json({ ... }); 
}

// 5. Normal Batch Closing & Manifest Creation (only runs once!)
```

This ensures isolated behaviors while reusing the exact same cron endpoint.

### Logging Requirements
- Integrate `logger.info`, `logger.error`, and `logEvent` at state transitions.
- All log lines will include `manifestId`, `retryCount`, `status`, and `cronRunId`.
