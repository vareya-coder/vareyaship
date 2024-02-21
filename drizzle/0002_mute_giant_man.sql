ALTER TABLE "shipment_items" ADD COLUMN "shipment_weight" real;--> statement-breakpoint
ALTER TABLE "shipment_details" DROP COLUMN IF EXISTS "shipment_weight";