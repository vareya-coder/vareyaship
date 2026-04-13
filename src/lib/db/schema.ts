

import { Table ,sql } from "drizzle-orm";
import { pgTable, serial, timestamp, text, integer, varchar, decimal , real, boolean, date } from "drizzle-orm/pg-core";

// =============================
// Manifest Automation - New Tables
// =============================

export const batches = pgTable('batches', {
    batch_id: serial('batch_id').primaryKey(),
    grouping_key: varchar('grouping_key'),
    operational_date: date('operational_date'),
    status: varchar('status'), // OPEN, CLOSING, MANIFESTED
    shipment_count: integer('shipment_count').default(0),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
    closing_at: timestamp('closing_at'),
});

export const shipments = pgTable('shipments', {
    id: serial('id').primaryKey(),
    external_shipment_id: varchar('external_shipment_id').notNull(), // idempotency key (Asendia/ShipHero identifier)
    order_id: integer('order_id'),
    account_id: integer('account_id'),
    shipping_method: varchar('shipping_method'),
    parcel_id: varchar('parcel_id').notNull(),
    tracking_number: varchar('tracking_number'),
    label_url: varchar('label_url'),
    batch_id: integer('batch_id').references(() => batches.batch_id),
    is_manifested: boolean('is_manifested').default(false),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const manifests = pgTable('manifests', {
    manifest_id: varchar('manifest_id').primaryKey(), // Asendia manifest id
    batch_id: integer('batch_id').references(() => batches.batch_id),
    status: varchar('status'),
    parcel_count_expected: integer('parcel_count_expected'),
    parcel_count_actual: integer('parcel_count_actual'),
    verification_status: varchar('verification_status'), // matched | mismatch
    document_url: varchar('document_url'),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export type BatchRow = typeof batches.$inferInsert;
export type ShipmentRow = typeof shipments.$inferInsert;
export type ManifestRow = typeof manifests.$inferInsert;




//address table
// export const addresses = pgTable('addresses', {
//     address_id: serial('address_id').primaryKey(),
//     address_type: serial('address_type'),
//     street: varchar('street'),
//     city: varchar('city'),
//     postal_code: varchar('postal_code'),
//     country: varchar('country'),
    
// });
// export const User=pgTable('User',{
//     id: serial('id'),
//     name: varchar('name').primaryKey(),
//     company: varchar('company'),
//     address_id: integer('address_id').references(() => addresses.address_id)
// })

export const shipmentDetails = pgTable('shipment_details', {
    shipment_id : serial('shipment_id').primaryKey(),
    barcode: varchar('barcode'),
    order_id: integer('order_id'),
    name : varchar('name'),
    company : varchar('company'),
    label_announced_at: timestamp('label_announced_at').default(sql`CURRENT_TIMESTAMP`),
    cancel_deadline: timestamp('cancel_deadline'),
    shipping_method: varchar('shipping_method'),
    from_address: varchar('from_address'),
    label_url : varchar('label_url'),
    request_body: varchar('request_body'),
});

// Customer details table
export const customerDetails = pgTable('customer_details', {
    customer_id: serial('customer_id').primaryKey(),
    customer_name: varchar('customer_name'),
    customer_email: varchar('customer_email'),
    to_address: varchar('to_address'),
    shipment_id: integer('shipment_id').references(() => shipmentDetails.shipment_id, { onDelete: 'cascade' })
});

// Shipment status table
export const shipmentStatus = pgTable('shipment_status', {
    status_id: serial('status_id').primaryKey(),
    shipment_id: integer('shipment_id').references(() => shipmentDetails.shipment_id, { onDelete: 'cascade' }),
    status_code: varchar('status_code'),
    status_description: text('status_description'),
    carrier_message: text('carrier_message'),
});

// Shipment items table
export const shipmentItems = pgTable('shipment_items', {
    item_id: serial('item_id').primaryKey(),
    shipment_id: integer('shipment_id').references(() => shipmentDetails.shipment_id, { onDelete: 'cascade' }),
    item_description: text('item_description'),
    quantity: integer('quantity'),
    shipment_weight: real('shipment_weight'),
    unit_price: decimal('unit_price'),
});

export type ShipmentDetailsType = typeof shipmentDetails.$inferInsert;
export type CustomerDetailsType = typeof customerDetails.$inferInsert;
export type ShipmentStatusType = typeof shipmentStatus.$inferInsert;
export type ShipmentItemsType = typeof shipmentItems.$inferInsert;
//export type AddressType = typeof addresses.$inferInsert;
