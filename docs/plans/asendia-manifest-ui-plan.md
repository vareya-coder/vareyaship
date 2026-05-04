# Asendia Manifest UI Implementation Plan

## Source

Requirement: `docs/requirements/asendia-manifest-UI.md`

## Product Intent

Build an operations control surface for Asendia manifest support. The UI must provide visibility, traceability, and controlled intervention while keeping the core manifest process webhook-driven, cron-driven, DB-driven, and based on explicit `parcel_id` lists.

The UI must not introduce a default "create manifest" workflow. Manifest creation remains owned by the cron/manual manifest services.

## MVP Scope

1. Batch Monitor
   - Show batches for an operational date.
   - Show status, grouping key, shipment counts, cutoff state, readiness, and actions.
   - Show late shipments created after cutoff so ops can keep them out of today's manifest.
   - Provide a controlled force-close action only for `OPEN` batches.

2. Manifest Viewer
   - Show manifest list with batch id, parcel counts, status, verification status, created time, and document link.
   - On selection, show parcels tied to that manifest from local DB.
   - Highlight verification match/mismatch and count differences.
   - Surface failed/at-risk parcels through manifest discrepancy data available locally.

3. Shipment Inspector
   - Search by order id, parcel id, or tracking number.
   - Show shipment details, batch assignment, manifest id, timestamps, and a simple lifecycle timeline.

4. Settings / Feature Flags
   - Read-only view of current feature flag values from `getFlags()`.
   - Present controls as status/toggle-like display for ops visibility.
   - Do not persist flag edits until a backed feature flag store exists.

## Backend API Surface

Add Next route handlers that read/write local domain services only:

- `GET /api/batches?date=YYYY-MM-DD`
  - Returns batches for the operational date.
  - Computes actual shipment count, manifested count, pending count, cutoff-applied flag, and readiness.

- `POST /api/batches/[batchId]/force-close`
  - Guarded override.
  - Allows only `OPEN -> CLOSING`.
  - Uses existing `closeBatchGuarded()`.
  - Does not call Asendia and does not create manifests.

- `GET /api/manifests`
  - Returns recent local manifest records.

- `GET /api/manifests/[manifestId]`
  - Returns manifest detail plus local shipments/parcel ids tied to that manifest.

- `GET /api/shipments?query=...`
  - Searches local shipments by order id, parcel id, tracking number, external shipment id, or manifest id.

- `GET /api/feature-flags`
  - Returns current `getFlags()` values.

## Data Rules

- Always expose manifest contents as explicit parcel ids from stored shipment rows.
- Never infer manifest inclusion from a batch alone.
- Force close locks a batch only; it does not manifest parcels.
- Late shipments are calculated from the configured cutoff time/timezone and surfaced as risk data.
- Verification status comes from the local manifest record: `matched`, `mismatch`, or pending.

## UI Structure

Replace the current homepage label table with a client operations console:

- Top operational header with date picker, Amsterdam timezone, pickup window, auto-mode status, refresh state.
- Tabs:
  - Batch Monitor
  - Manifest Viewer
  - Shipment Inspector
  - Settings
- Poll operational APIs every 45 seconds.
- Keep tables dense and scan-friendly.
- Use icons for refresh, view, close, download, search, settings, and risk states.
- Use explicit confirmation before force close.

## Implementation Steps

1. Add API routes under `src/app/api`.
2. Add any repository helpers needed for listing/searching without changing existing manifest behavior.
3. Replace `src/app/page.tsx` with the operations UI entry point.
4. Add a client component under `src/app/screens` for polling, tabs, tables, details, and actions.
5. Keep styles in Tailwind classes and use existing UI primitives.
6. Verify with TypeScript/build checks.

## Out of Scope

- Editable feature flag persistence.
- Role-based access control beyond existing app authentication.
- Websocket updates.
- New background workers.
- Direct Asendia calls from UI.
- Default "Create Manifest" button.

