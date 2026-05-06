import { logger } from '@/utils/logger';
import { isManifestEnabled } from '@/modules/featureFlags/featureFlag.service';
import { getOrCreateOpenBatch, assignShipmentToBatch } from '@/modules/batching/batch.service';
import { findShipmentByExternalId, insertShipment, listRecentShipments, setShipmentBatch } from './shipment.repository';
import type { IngestAsendiaShipmentInput } from './shipment.types';

function normalizeCreatedAt(value: Date | string | null | undefined): Date {
  if (!value) return new Date();
  const createdAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`Invalid Asendia shipment created_at: ${String(value)}`);
  }
  return createdAt;
}

export async function ingestAsendiaShipment(input: IngestAsendiaShipmentInput) {
  const existing = await findShipmentByExternalId(input.external_shipment_id);
  if (existing) {
    logger.info('shipment_ingested', { shipment_id: (existing as any).id, status: 'duplicate', timestamp: new Date().toISOString() } as any);
    return existing;
  }

  if (!input.crm_id) {
    throw new Error(`Missing crm_id for Asendia shipment ${input.external_shipment_id}.`);
  }

  if (!isManifestEnabled(input.crm_id)) {
    logger.info('shipment_ingested', {
      external_shipment_id: input.external_shipment_id,
      crm_id: input.crm_id,
      status: 'manifest_disabled',
      timestamp: new Date().toISOString(),
    } as any);
    return { skipped: true, reason: 'manifest_disabled', crm_id: input.crm_id };
  }

  const shipmentCreatedAt = normalizeCreatedAt(input.created_at);

  const created = await insertShipment({
    external_shipment_id: input.external_shipment_id,
    order_id: input.order_id,
    account_id: input.account_id,
    crm_id: input.crm_id,
    sender_tax_code: input.sender_tax_code ?? null,
    shipping_method: input.shipping_method,
    parcel_id: input.parcel_id,
    tracking_number: input.tracking_number ?? null,
    label_url: input.label_url ?? null,
    is_manifested: false,
    created_at: shipmentCreatedAt,
  });

  logger.info('shipment_ingested', { shipment_id: created.id, status: 'created', timestamp: new Date().toISOString() } as any);

  const batch = await getOrCreateOpenBatch({
    shipping_method: input.shipping_method,
    account_id: input.account_id,
    crm_id: input.crm_id,
    createdAt: shipmentCreatedAt,
  });
  await setShipmentBatch((created as any).id, batch.batch_id);
  await assignShipmentToBatch(batch.batch_id);

  return { id: (created as any).id, batch_id: batch.batch_id, operational_date: batch.operational_date };
}

export async function listRecentAsendiaShipments(limit = 100) {
  return listRecentShipments(limit);
}
