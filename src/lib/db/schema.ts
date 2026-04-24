

import { sql } from "drizzle-orm";
import { pgTable, serial, timestamp, integer, varchar, boolean, date } from "drizzle-orm/pg-core";

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
