# Drizzle Migration — Asendia Manifest Tables Only

Goal: create only new tables for the Asendia manifest system without touching existing tables.

## Option A — Manual migration (recommended for safety)

1) Create a migration file, e.g. `drizzle/001_asendia_manifest_init.sql` with:

```sql
-- Batches
CREATE TABLE IF NOT EXISTS "batches" (
  "batch_id" serial PRIMARY KEY,
  "grouping_key" varchar,
  "operational_date" date,
  "status" varchar,
  "shipment_count" integer DEFAULT 0,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
  "closing_at" timestamp
);

-- Shipments
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" serial PRIMARY KEY,
  "external_shipment_id" varchar NOT NULL,
  "order_id" integer,
  "account_id" integer,
  "shipping_method" varchar,
  "parcel_id" varchar NOT NULL,
  "tracking_number" varchar,
  "label_url" varchar,
  "batch_id" integer REFERENCES "batches"("batch_id"),
  "is_manifested" boolean DEFAULT false,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Manifests
CREATE TABLE IF NOT EXISTS "manifests" (
  "manifest_id" varchar PRIMARY KEY,
  "batch_id" integer REFERENCES "batches"("batch_id"),
  "status" varchar,
  "parcel_count_expected" integer,
  "parcel_count_actual" integer,
  "verification_status" varchar,
  "document_url" varchar,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
```

2) Apply it using your normal workflow (psql, drizzle push, or migration runner).

This approach guarantees only these tables are created/altered.

## Option B — Drizzle generate with baseline

If you want to rely on `drizzle-kit generate`, create a baseline first:

- Ensure `drizzle/` contains migrations that reflect your current DB.
- If it’s empty but the DB already has tables, first generate a baseline migration from the live DB (via `drizzle-kit introspect` + manual baseline), mark it as applied, then run `drizzle-kit generate` again. That diff will include only the new tables.

Notes:
- We intentionally did not add UNIQUE constraints; idempotency is handled in code for now.
- You can add indexes later as needed.

