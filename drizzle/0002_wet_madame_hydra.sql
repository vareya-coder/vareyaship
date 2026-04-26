CREATE TABLE IF NOT EXISTS "asendia_customer_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"customer_name" varchar NOT NULL,
	"crm_id" varchar NOT NULL,
	"sender_tax_code" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "crm_id" varchar;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "crm_id" varchar;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "sender_tax_code" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asendia_customer_mappings_account_id_idx" ON "asendia_customer_mappings" ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asendia_customer_mappings_crm_id_idx" ON "asendia_customer_mappings" ("crm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asendia_customer_mappings_active_idx" ON "asendia_customer_mappings" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_operational_status_grouping_crm_idx" ON "batches" ("operational_date","status","grouping_key","crm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_batch_crm_manifested_idx" ON "shipments" ("batch_id","crm_id","is_manifested");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_account_crm_idx" ON "shipments" ("account_id","crm_id");
--> statement-breakpoint
INSERT INTO "asendia_customer_mappings" ("account_id", "customer_name", "crm_id", "sender_tax_code", "is_active")
VALUES
	(59965, 'Menskin', 'NL21010001', 'GB339713089000', true),
	(73982, 'Vacier', 'NL21080010', 'GB289337944', true),
	(74928, 'VUE', 'NL24010007', 'GB289337944', true),
	(63819, 'SanaDIGEST', 'NL21110007', 'FR48884514688', true),
	(71893, 'PRIMAL FX', 'NL21110007', 'GB289337944', true),
	(70098, 'Fan Of Fan', 'NL21110007', 'GB289337944', true),
	(69949, 'PSBC Limited', 'NL21110007', 'GB289337944', true),
	(73490, 'Dino Lifestyle', 'NL21110007', 'GB289337944', true),
	(68917, 'Bryght Labs', 'NL21110007', 'GB289337944', true),
	(81021, 'Tipaw', 'NL24120003', NULL, true),
	(85552, 'Ship2me', 'NL25040001', 'GB289337944', true),
	(85165, 'NorwegianLab', 'NL25040002', 'GB289337944', true)
ON CONFLICT ("account_id") DO UPDATE
SET
	"customer_name" = EXCLUDED."customer_name",
	"crm_id" = EXCLUDED."crm_id",
	"sender_tax_code" = EXCLUDED."sender_tax_code",
	"is_active" = EXCLUDED."is_active";
