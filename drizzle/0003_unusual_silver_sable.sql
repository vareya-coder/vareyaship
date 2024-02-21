ALTER TABLE "shipment_details" DROP CONSTRAINT "shipment_details_shipment_status_shipment_status_status_id_fk";
--> statement-breakpoint
ALTER TABLE "shipment_details" DROP COLUMN IF EXISTS "shipment_status";