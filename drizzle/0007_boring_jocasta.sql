ALTER TABLE "manifests" ADD COLUMN IF NOT EXISTS "success_notified_at" timestamp;
