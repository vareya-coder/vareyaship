ALTER TABLE "customer_details" DROP CONSTRAINT "customer_details_order_id_shipment_details_order_id_fk";
--> statement-breakpoint
ALTER TABLE "shipment_items" DROP CONSTRAINT "shipment_items_order_id_shipment_details_order_id_fk";
--> statement-breakpoint
ALTER TABLE "shipment_status" DROP CONSTRAINT "shipment_status_order_id_shipment_details_order_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_details" ADD CONSTRAINT "customer_details_order_id_shipment_details_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "shipment_details"("order_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_id_shipment_details_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "shipment_details"("order_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_status" ADD CONSTRAINT "shipment_status_order_id_shipment_details_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "shipment_details"("order_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "shipment_status" DROP COLUMN IF EXISTS "timestamp";