import { sql } from "drizzle-orm";
import { pgTable, serial, timestamp, integer, varchar, boolean, date, text, uniqueIndex, index, jsonb, numeric } from "drizzle-orm/pg-core";

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
    externalShipmentUnique: uniqueIndex('shipments_external_shipment_id_unique_idx').on(table.external_shipment_id),
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
    status: varchar('status'), // MANIFEST_CREATED, PDF_PENDING, UPLOADED, FAILED
    parcel_count_expected: integer('parcel_count_expected'),
    parcel_count_actual: integer('parcel_count_actual'),
    verification_status: varchar('verification_status'), // matched | mismatch
    document_url: varchar('document_url'),
    created_at: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
    pdf_retry_count: integer('pdf_retry_count').default(0),
    pdf_last_attempt_at: timestamp('pdf_last_attempt_at'),
    pdf_next_retry_at: timestamp('pdf_next_retry_at'),
    pdf_ready_at: timestamp('pdf_ready_at'),
    pdf_failure_reason: text('pdf_failure_reason'),
    success_notified_at: timestamp('success_notified_at'),
}, (table) => ({
    statusNextRetryIdx: index('manifests_status_next_retry_idx').on(table.status, table.pdf_next_retry_at),
}));

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



export const vacierLatamCustomsRuns = pgTable('vacier_latam_customs_runs', {
    id: serial('id').primaryKey(),
    batchId: varchar('batch_id', { length: 50 }).notNull().unique(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ordersQueried: integer('orders_queried').default(0),
    ordersProcessed: integer('orders_processed').default(0),
    ordersSkipped: integer('orders_skipped').default(0),
    errorsCount: integer('errors_count').default(0),
    errorDetails: jsonb('error_details'),
    creditsUsed: integer('credits_used').default(0),
    dryRun: boolean('dry_run').default(false),
    status: varchar('status', { length: 20 }).notNull(),
}, (table) => ({
    batchIdIdx: index('vacier_latam_customs_runs_batch_id_idx').on(table.batchId),
    statusStartedIdx: index('vacier_latam_customs_runs_status_started_idx').on(table.status, table.startedAt),
}));

export const vacierLatamCustomsCursor = pgTable('vacier_latam_customs_cursor', {
    id: serial('id').primaryKey(),
    cursorName: varchar('cursor_name', { length: 50 }).notNull().unique(),
    lastProcessedDate: timestamp('last_processed_date', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedByBatchId: varchar('updated_by_batch_id', { length: 50 }),
}, (table) => ({
    cursorNameIdx: index('vacier_latam_customs_cursor_name_idx').on(table.cursorName),
}));

export const vacierLatamCustomsOrderResults = pgTable('vacier_latam_customs_order_results', {
    id: serial('id').primaryKey(),
    batchId: varchar('batch_id', { length: 50 }).notNull(),
    orderId: varchar('order_id', { length: 80 }).notNull(),
    orderNumber: varchar('order_number', { length: 120 }).notNull(),
    destinationCountry: varchar('destination_country', { length: 10 }),
    orderDate: timestamp('order_date', { withTimezone: true }),
    status: varchar('status', { length: 20 }).notNull(),
    reason: varchar('reason', { length: 120 }),
    copiedCustomsTotal: varchar('copied_customs_total', { length: 30 }),
    aboveReferenceValue: boolean('above_reference_value').default(false),
    lineItemCount: integer('line_item_count').default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    batchIdIdx: index('vacier_latam_customs_results_batch_id_idx').on(table.batchId),
    orderIdIdx: index('vacier_latam_customs_results_order_id_idx').on(table.orderId),
    orderNumberIdx: index('vacier_latam_customs_results_order_number_idx').on(table.orderNumber),
    statusIdx: index('vacier_latam_customs_results_status_idx').on(table.status),
    createdAtIdx: index('vacier_latam_customs_results_created_at_idx').on(table.createdAt),
}));


export const vacierLatamCustomsOverrides = pgTable('vacier_latam_customs_overrides', {
    id: serial('id').primaryKey(),
    sku: varchar('sku', { length: 120 }).notNull(),
    productName: varchar('product_name', { length: 255 }),
    customsValue: numeric('customs_value', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    countryCode: varchar('country_code', { length: 10 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    source: varchar('source', { length: 120 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy: varchar('updated_by', { length: 120 }),
}, (table) => ({
    skuIdx: index('vacier_latam_customs_overrides_sku_idx').on(table.sku),
    countryIdx: index('vacier_latam_customs_overrides_country_idx').on(table.countryCode),
    activeIdx: index('vacier_latam_customs_overrides_active_idx').on(table.isActive),
    activeSkuCountryUnique: uniqueIndex('vacier_latam_customs_overrides_active_sku_country_idx')
        .on(table.sku, table.countryCode)
        .where(sql`is_active = true`),
}));

export const vacierTurkeyCustomsOverrides = pgTable('vacier_turkey_customs_overrides', {
    id: serial('id').primaryKey(),
    sku: varchar('sku', { length: 120 }).notNull(),
    productName: varchar('product_name', { length: 255 }),
    customsDescription: text('customs_description').notNull(),
    customsValue: numeric('customs_value', { precision: 12, scale: 2 }).notNull(),
    tariffCode: varchar('tariff_code', { length: 40 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    isActive: boolean('is_active').notNull().default(true),
    source: varchar('source', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    skuIdx: index('vacier_turkey_customs_overrides_sku_idx').on(table.sku),
    activeIdx: index('vacier_turkey_customs_overrides_active_idx').on(table.isActive),
    activeSkuUnique: uniqueIndex('vacier_turkey_customs_overrides_active_sku_idx')
        .on(table.sku)
        .where(sql`is_active = true`),
}));

export type BatchRow = typeof batches.$inferInsert;
export type ShipmentRow = typeof shipments.$inferInsert;
export type ManifestRow = typeof manifests.$inferInsert;
export type CronRunRow = typeof cronRuns.$inferInsert;
export type AsendiaCustomerMappingRow = typeof asendiaCustomerMappings.$inferInsert;
export type VacierLatamCustomsRunRow = typeof vacierLatamCustomsRuns.$inferInsert;
export type VacierLatamCustomsCursorRow = typeof vacierLatamCustomsCursor.$inferInsert;
export type VacierLatamCustomsOrderResultRow = typeof vacierLatamCustomsOrderResults.$inferInsert;
export type VacierLatamCustomsOverrideRow = typeof vacierLatamCustomsOverrides.$inferInsert;
export type VacierTurkeyCustomsOverrideRow = typeof vacierTurkeyCustomsOverrides.$inferInsert;
