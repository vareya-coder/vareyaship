ALTER TABLE "manifests" ADD COLUMN "pdf_retry_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "manifests" ADD COLUMN "pdf_last_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "manifests" ADD COLUMN "pdf_next_retry_at" timestamp;--> statement-breakpoint
ALTER TABLE "manifests" ADD COLUMN "pdf_ready_at" timestamp;--> statement-breakpoint
ALTER TABLE "manifests" ADD COLUMN "pdf_failure_reason" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manifests_status_next_retry_idx" ON "manifests" ("status","pdf_next_retry_at");