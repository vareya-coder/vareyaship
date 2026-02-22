This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, add .env file with following environment variables:
CUSTOMER_CODE=
CUSTOMER_NUMBER=
UPLOADTHING_TOKEN=
UPLOADTHING_APP_ID=
POSTNL_API_KEY=
DATABASE_URL=
CRON_SECRET=

# Optional cleanup controls
UT_KEEP_FILES_COUNT=1500
UT_DELETE_MAX_BATCHES=10
UPLOADTHING_PDF_PROXY_URL_ENABLED=false

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

Shipment label responses now include a bounded URL readiness check (up to 2 seconds, 250ms interval)
before returning the label URL. If readiness does not complete in time, the API still returns the URL
and logs a timeout event for monitoring.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
