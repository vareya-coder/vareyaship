import { logger } from '@/utils/logger';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { getOperationalDateISO } from '@/modules/time/time';
import { getOrCreateOpenBatch, assignShipmentToBatch } from '@/modules/batching/batch.service';
import { findShipmentByExternalId, insertShipment, listRecentShipments, setShipmentBatch } from './shipment.repository';
import type { IngestAsendiaShipmentInput } from './shipment.types';

export async function ingestAsendiaShipment(input: IngestAsendiaShipmentInput) {
  const existing = await findShipmentByExternalId(input.external_shipment_id);
  if (existing) {
    logger.info('shipment_ingested', { shipment_id: (existing as any).id, status: 'duplicate', timestamp: new Date().toISOString() } as any);
    return existing;
  }

  if (!input.crm_id) {
    throw new Error(`Missing crm_id for Asendia shipment ${input.external_shipment_id}.`);
  }

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
  });

  logger.info('shipment_ingested', { shipment_id: created.id, status: 'created', timestamp: new Date().toISOString() } as any);

  const { cutoff_timezone } = getFlags();
  const operational_date = getOperationalDateISO(new Date(), cutoff_timezone);
  const batch = await getOrCreateOpenBatch({
    shipping_method: input.shipping_method,
    account_id: input.account_id,
    crm_id: input.crm_id,
  });
  await setShipmentBatch((created as any).id, batch.batch_id);
  await assignShipmentToBatch(batch.batch_id);

  return { id: (created as any).id, batch_id: batch.batch_id, operational_date };
}

export async function listRecentAsendiaShipments(limit = 100) {
  return listRecentShipments(limit);
}
