This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, add .env file with following environment variables:
CUSTOMER_CODE=
CUSTOMER_NUMBER=
UPLOADTHING_TOKEN=
POSTNL_API_KEY=
DATABASE_URL=
CRON_SECRET=

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

## Asendia Manifest Automation (Headless)

Endpoints:
- `GET /api/cron/manifest-trigger` — evaluates/creates manifests (10-min schedule, `Authorization: Bearer ${CRON_SECRET}`)
- `GET /api/cron/manifest-retention` — deletes old manifest PDFs (daily, `Authorization: Bearer ${CRON_SECRET}`)

Feature flags (env):
- `DRY_RUN_MANIFEST`, `CUTOFF_TIME`, `CUTOFF_TIMEZONE`, `BATCH_INTERVAL_HOURS`, `SHIPMENT_THRESHOLD`, `RETENTION_DAYS`

Docs:
- docs/operations/asendia-manifest-cron.md
- docs/db/migrations-asendia.md
- docs/testing/asendia-manifest-tests.md

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
