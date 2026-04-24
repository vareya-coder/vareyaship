CREATE TABLE IF NOT EXISTS "batches" (
	"batch_id" serial PRIMARY KEY NOT NULL,
	"grouping_key" varchar,
	"operational_date" date,
	"status" varchar,
	"shipment_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"closing_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manifests" (
	"manifest_id" varchar PRIMARY KEY NOT NULL,
	"batch_id" integer,
	"status" varchar,
	"parcel_count_expected" integer,
	"parcel_count_actual" integer,
	"verification_status" varchar,
	"document_url" varchar,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_shipment_id" varchar NOT NULL,
	"order_id" integer,
	"account_id" integer,
	"shipping_method" varchar,
	"parcel_id" varchar NOT NULL,
	"tracking_number" varchar,
	"label_url" varchar,
	"batch_id" integer,
	"is_manifested" boolean DEFAULT false,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "manifests" ADD CONSTRAINT "manifests_batch_id_batches_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_batch_id_batches_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
