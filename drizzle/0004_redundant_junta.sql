ALTER TABLE "shipments" ADD COLUMN "manifest_id" varchar;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_manifest_id_idx" ON "shipments" ("manifest_id");