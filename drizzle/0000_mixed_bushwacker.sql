CREATE TABLE IF NOT EXISTS "customer_details" (
	"customer_id" serial PRIMARY KEY NOT NULL,
	"customer_name" varchar,
	"customer_email" varchar,
	"to_address" varchar,
	"order_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_details" (
	"barcode" varchar,
	"order_id" integer PRIMARY KEY NOT NULL,
	"name" varchar,
	"company" varchar,
	"label_announced_at" timestamp,
	"cancel_deadline" timestamp,
	"shipping_method" varchar,
	"shipment_weight" real,
	"from_address" varchar,
	"shipment_status" serial NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_items" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"item_description" text,
	"quantity" integer,
	"unit_price" numeric
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_status" (
	"status_id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"status_code" varchar,
	"status_description" text,
	"timestamp" timestamp,
	"carrier_message" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_details" ADD CONSTRAINT "customer_details_order_id_shipment_details_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "shipment_details"("order_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_details" ADD CONSTRAINT "shipment_details_shipment_status_shipment_status_status_id_fk" FOREIGN KEY ("shipment_status") REFERENCES "shipment_status"("status_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_id_shipment_details_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "shipment_details"("order_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_status" ADD CONSTRAINT "shipment_status_order_id_shipment_details_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "shipment_details"("order_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
