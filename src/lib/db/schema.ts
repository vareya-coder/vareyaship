import { sql } from "drizzle-orm";
import { pgTable, serial, timestamp, integer, varchar, boolean, date, text, uniqueIndex, index } from "drizzle-orm/pg-core";

// =============================
// Manifest Automation - New Tables
// =============================

export const batches = pgTable('batches', {
    batch_id: serial('batch_id').primaryKey(),
    grouping_key: varchar('grouping_key'),
    operational_date: date('operational_date'),
    status: varchar('status'), // OPEN, CLOSING, MANIFESTED
    crm_id: varchar('crm_id'),
    shipment_count: integer('shipment_count').default(0),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
    closing_at: timestamp('closing_at'),
}, (table) => ({
    operationalStatusGroupingCrmIdx: index('batches_operational_status_grouping_crm_idx').on(
        table.operational_date,
        table.status,
        table.grouping_key,
        table.crm_id,
    ),
}));

export const shipments = pgTable('shipments', {
    id: serial('id').primaryKey(),
    external_shipment_id: varchar('external_shipment_id').notNull(), // idempotency key (Asendia/ShipHero identifier)
    order_id: integer('order_id'),
    account_id: integer('account_id'),
    crm_id: varchar('crm_id'),
    manifest_id: varchar('manifest_id'),
    sender_tax_code: varchar('sender_tax_code'),
    shipping_method: varchar('shipping_method'),
    parcel_id: varchar('parcel_id').notNull(),
    tracking_number: varchar('tracking_number'),
    label_url: varchar('label_url'),
    batch_id: integer('batch_id').references(() => batches.batch_id),
    is_manifested: boolean('is_manifested').default(false),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    batchCrmManifestedIdx: index('shipments_batch_crm_manifested_idx').on(
        table.batch_id,
        table.crm_id,
        table.is_manifested,
    ),
    accountCrmIdx: index('shipments_account_crm_idx').on(table.account_id, table.crm_id),
    manifestIdx: index('shipments_manifest_id_idx').on(table.manifest_id),
}));

export const asendiaCustomerMappings = pgTable('asendia_customer_mappings', {
    id: serial('id').primaryKey(),
    account_id: integer('account_id').notNull(),
    customer_name: varchar('customer_name').notNull(),
    crm_id: varchar('crm_id').notNull(),
    sender_tax_code: varchar('sender_tax_code'),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    accountIdUnique: uniqueIndex('asendia_customer_mappings_account_id_idx').on(table.account_id),
    crmIdIdx: index('asendia_customer_mappings_crm_id_idx').on(table.crm_id),
    activeIdx: index('asendia_customer_mappings_active_idx').on(table.is_active),
}));

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

export const cronRuns = pgTable('cron_runs', {
    id: serial('id').primaryKey(),
    job_name: varchar('job_name').notNull(),
    operational_date: date('operational_date').notNull(),
    status: varchar('status').notNull(), // started | completed | failed
    started_at: timestamp('started_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    completed_at: timestamp('completed_at'),
    error_message: text('error_message'),
}, (table) => ({
    jobDateUnique: uniqueIndex('cron_runs_job_name_operational_date_idx').on(table.job_name, table.operational_date),
}));

export type BatchRow = typeof batches.$inferInsert;
export type ShipmentRow = typeof shipments.$inferInsert;
export type ManifestRow = typeof manifests.$inferInsert;
export type CronRunRow = typeof cronRuns.$inferInsert;
export type AsendiaCustomerMappingRow = typeof asendiaCustomerMappings.$inferInsert;
