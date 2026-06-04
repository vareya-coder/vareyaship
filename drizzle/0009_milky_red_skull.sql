CREATE TABLE IF NOT EXISTS "vacier_latam_customs_cursor" (
	"id" serial PRIMARY KEY NOT NULL,
	"cursor_name" varchar(50) NOT NULL,
	"last_processed_date" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_by_batch_id" varchar(50),
	CONSTRAINT "vacier_latam_customs_cursor_cursor_name_unique" UNIQUE("cursor_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vacier_latam_customs_order_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" varchar(50) NOT NULL,
	"order_id" varchar(80) NOT NULL,
	"order_number" varchar(120) NOT NULL,
	"destination_country" varchar(10),
	"order_date" timestamp with time zone,
	"status" varchar(20) NOT NULL,
	"reason" varchar(120),
	"copied_customs_total" varchar(30),
	"above_reference_value" boolean DEFAULT false,
	"line_item_count" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vacier_latam_customs_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" varchar(120) NOT NULL,
	"product_name" varchar(255),
	"customs_value" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"country_code" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" varchar(120),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_by" varchar(120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vacier_latam_customs_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" varchar(50) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"orders_queried" integer DEFAULT 0,
	"orders_processed" integer DEFAULT 0,
	"orders_skipped" integer DEFAULT 0,
	"errors_count" integer DEFAULT 0,
	"error_details" jsonb,
	"credits_used" integer DEFAULT 0,
	"dry_run" boolean DEFAULT false,
	"status" varchar(20) NOT NULL,
	CONSTRAINT "vacier_latam_customs_runs_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_cursor_name_idx" ON "vacier_latam_customs_cursor" ("cursor_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_results_batch_id_idx" ON "vacier_latam_customs_order_results" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_results_order_id_idx" ON "vacier_latam_customs_order_results" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_results_order_number_idx" ON "vacier_latam_customs_order_results" ("order_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_results_status_idx" ON "vacier_latam_customs_order_results" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_results_created_at_idx" ON "vacier_latam_customs_order_results" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_overrides_sku_idx" ON "vacier_latam_customs_overrides" ("sku");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_overrides_country_idx" ON "vacier_latam_customs_overrides" ("country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_overrides_active_idx" ON "vacier_latam_customs_overrides" ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vacier_latam_customs_overrides_active_sku_country_idx" ON "vacier_latam_customs_overrides" ("sku","country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_runs_batch_id_idx" ON "vacier_latam_customs_runs" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vacier_latam_customs_runs_status_started_idx" ON "vacier_latam_customs_runs" ("status","started_at");