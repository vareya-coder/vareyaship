This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, add .env file with following environment variables:
CUSTOMER_CODE=
CUSTOMER_NUMBER=
UPLOADTHING_TOKEN=
POSTNL_API_KEY=
VAREYASHIP_DATABASE_DATABASE_URL=
CRON_SECRET=

# Vacier LATAM label-time customs overrides
# Keep disabled until migration 0013 has been applied and filtered test orders are ready.
VACIER_LATAM_CUSTOMS_ENABLED=false
VACIER_LATAM_COUNTRIES=EC,BR,AR
VACIER_LATAM_ASENDIA_TAX_ID_COUNTRIES=EC,BR,AR
# Optional; defaults to 129600 seconds (36 hours).
VACIER_LATAM_CUSTOMS_CACHE_TTL_SECONDS=129600

# Royal Mail Click & Drop
ROYALMAIL_API_BASE_URL=https://api.parcel.royalmail.com
ROYALMAIL_API_TOKEN=
ROYALMAIL_AUTH_SCHEME=bearer
ROYALMAIL_SERVICE_CODE_TRACKED_24_NS=
ROYALMAIL_SERVICE_CODE_TRACKED_48_NS=
ROYALMAIL_SERVICE_CODE_TRACKED_LB48_NS=
ROYALMAIL_SERVICE_REGISTER_CODE_TRACKED_24_NS=
ROYALMAIL_SERVICE_REGISTER_CODE_TRACKED_48_NS=
ROYALMAIL_SERVICE_REGISTER_CODE_TRACKED_LB48_NS=
ROYALMAIL_TRACKING_URL_TEMPLATE=https://www.royalmail.com/track-your-item#/tracking-results/{trackingNumber}

# Optional (only needed if you do not provide UPLOADTHING_TOKEN)
UPLOADTHING_APP_ID=

# Optional cleanup controls
UT_KEEP_FILES_COUNT=1500
UT_DELETE_MAX_BATCHES=10
UPLOADTHING_PDF_PROXY_URL_ENABLED=false
UPLOADTHING_PDF_PROXY_STREAMING_ENABLED=false
UPLOADTHING_LABEL_URL_READINESS_ENABLED=true

# Optional monitoring (Axiom)
AXIOM_DATASET=
AXIOM_TOKEN=
AXIOM_ORGANIZATION=

Then, pnpm install packages:

```bash
pnpm install
```

Then, run the migrations commands:

```bash
pnpm run db:generate
```

and

```bash
pnpm run db:migrate
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Vacier Customs Overrides

Vacier LATAM customs values are applied only while generating PostNL or Asendia labels for account
`73982`. The carrier payload uses the database override value and the ShipHero product name while the
ShipHero order remains unchanged. The former ShipHero mutation cron is retired.

Before enabling LATAM in production:

1. Apply migration `0013_vacier_latam_label_time_customs`.
2. Set `VACIER_LATAM_CUSTOMS_ENABLED=true`.
3. Verify the PostNL customs data and the unchanged ShipHero invoice using fresh test orders.

Internal management pages:

- `/vacier-latam-customs`
- `/vacier-turkey-customs`

## Asendia Manifest Automation (Headless)

Endpoints:
- `GET /api/cron/manifest-trigger` — closes batches and creates Asendia manifests from explicit parcel IDs (17:25 Europe/Amsterdam, `Authorization: Bearer ${CRON_SECRET}`)
- `GET /api/cron/manifest-documents` — fetches manifest PDFs, uploads to UploadThing, then sends success email only when a manifest URL exists (17:30 Europe/Amsterdam, `Authorization: Bearer ${CRON_SECRET}`)
- `GET /api/cron/manifest-retention` — deletes old manifest PDFs (daily, `Authorization: Bearer ${CRON_SECRET}`)

Vercel cron is UTC-only, so `vercel.json` contains both CEST and CET UTC schedules for the two manifest jobs. Route-level Amsterdam-time guards ignore the inactive seasonal duplicate. If `MANIFEST_TRIGGER_TIME` / `MANIFEST_TRIGGER_TIMEZONE` is configured later than the fixed cron execution time, that day’s cron exits without work.

Feature flags (env):
- `DRY_RUN_MANIFEST`, `CUTOFF_TIME`, `CUTOFF_TIMEZONE`, `MANIFEST_TRIGGER_TIME`, `MANIFEST_TRIGGER_TIMEZONE`, `BATCH_INTERVAL_HOURS`, `SHIPMENT_THRESHOLD`, `RETENTION_DAYS`
- `ENABLE_MANIFEST_VERIFICATION` controls the Asendia parcel-list verification step and defaults to `true`
- `ASENDIA_MANIFEST_PARCELS_PAGE_SIZE` controls manifest parcel-list verification page size and defaults to `250`
- `ASENDIA_MANIFEST_PARCELS_MAX_PAGES` controls the maximum verification pages fetched and defaults to `50`
- `MANIFEST_ENABLED_CRM_IDS` optionally limits manifest automation to a comma-separated or JSON list, e.g. `NL24120003` or `["NL24120003"]`; omit it or leave it empty to process all CRM IDs

Docs:
- docs/operations/asendia-manifest-cron.md
- docs/db/migrations-asendia.md
- docs/testing/asendia-manifest-tests.md

Manual recovery command:

```bash
pnpm manifest:recreate --manifest-id <manifest-id>
```

Manual batch recovery command:

```bash
pnpm manifest:manual-process --batch-id <batch-id> [--manifest-id <manifest-id>]
```

## UploadThing Cleanup Cron

This project includes a cleanup route at:

`GET /api/cron/ut-delete-old-files`

The route requires:

- `Authorization: Bearer <CRON_SECRET>`

Vercel cron is configured in `vercel.json` to run daily at `03:00 UTC`.

Manual trigger example:

```bash
curl -X GET "https://<your-domain>/api/cron/ut-delete-old-files" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Label URLs can optionally be proxied as:

- `https://<your-domain>/api/uploadthing/file/<file-key>.pdf`

Enable this behavior with:

- `UPLOADTHING_PDF_PROXY_URL_ENABLED=true`

When disabled (default), shipment APIs return the direct UploadThing `ufsUrl` to avoid extra proxy traffic costs.

For ShipHero compatibility, if extension-less UploadThing URLs are rejected, enable
`UPLOADTHING_PDF_PROXY_URL_ENABLED=true` so webhook responses return a `.pdf` URL path.

If your client does not follow redirects, you can enable proxy streaming mode by setting both:

- `UPLOADTHING_PDF_PROXY_URL_ENABLED=true`
- `UPLOADTHING_PDF_PROXY_STREAMING_ENABLED=true`

When both are enabled, `/api/uploadthing/file/<file-key>.pdf` returns streamed file bytes directly
instead of redirecting to UploadThing. This improves compatibility but increases proxy egress costs.

Shipment label responses now include a bounded URL readiness check (up to 2 seconds, 250ms interval)
before returning the label URL. If readiness does not complete in time, the API still returns the URL
and logs a timeout event for monitoring.

You can disable this readiness wait entirely by setting:

- `UPLOADTHING_LABEL_URL_READINESS_ENABLED=false`

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
