import { logger } from '@/utils/logger';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import {
  AMSTERDAM_TIME_ZONE,
  getOperationalDateISO,
  getShipmentOperationalDateISO,
  hasReachedCutoff,
} from '@/modules/time/time';
import { createBatch, findOpenBatch, incrementBatchShipmentCount, listOpenBatches, setBatchStatusGuarded } from './batch.repository';
import type { GroupingKey } from './batch.types';

export function buildGroupingKey(input: { shipping_method?: string | null; account_id?: number | null; crm_id?: string | null }): GroupingKey | null {
  const flags = getFlags();
  const parts: string[] = [];
  if (input.crm_id) {
    parts.push(`crm:${input.crm_id}`);
  }
  if (flags.enable_service_separation && input.shipping_method) {
    parts.push(`sm:${input.shipping_method}`);
  }
  if (flags.enable_client_separation && input.account_id) {
    parts.push(`acct:${input.account_id}`);
  }
  return parts.length > 0 ? parts.join('|') : null;
}

export async function getOrCreateOpenBatch(params: {
  shipping_method?: string | null;
  account_id?: number | null;
  crm_id?: string | null;
  createdAt?: Date;
  now?: Date;
}): Promise<{ batch_id: number; operational_date: string }> {
  const shipmentCreatedAt = params.createdAt ?? params.now ?? new Date();
  const { cutoff_time } = getFlags();
  const operationalDateISO = getShipmentOperationalDateISO(
    shipmentCreatedAt,
    cutoff_time,
    AMSTERDAM_TIME_ZONE,
  );
  const groupingKey = buildGroupingKey({
    shipping_method: params.shipping_method ?? null,
    account_id: params.account_id ?? null,
    crm_id: params.crm_id ?? null,
  });

  const existing = await findOpenBatch(groupingKey, operationalDateISO, params.crm_id ?? null);
  if (existing) {
    return { batch_id: (existing as any).batch_id, operational_date: operationalDateISO };
  }

  const created = await createBatch({
    groupingKey,
    operationalDateISO,
    crmId: params.crm_id ?? null,
  });
  logger.info('batch_created', {
    batch_id: created.batch_id,
    grouping_key: groupingKey,
    crm_id: params.crm_id ?? null,
    operational_date: operationalDateISO,
    timestamp: new Date().toISOString(),
    status: 'OPEN',
  } as any);
  return { batch_id: created.batch_id, operational_date: operationalDateISO };
}

export async function assignShipmentToBatch(batchId: number) {
  await incrementBatchShipmentCount(batchId);
  logger.info('batch_assigned', { batch_id: batchId, timestamp: new Date().toISOString() } as any);
}

export async function evaluateBatchesForClosing(now: Date = new Date()): Promise<{ toCloseIds: number[]; reason: 'cutoff' | 'interval_or_threshold' | 'none' }> {
  const flags = getFlags();
  const open = await listOpenBatches();
  if (open.length === 0) return { toCloseIds: [], reason: 'none' };

  const todayISO = getOperationalDateISO(now, AMSTERDAM_TIME_ZONE);
  const openDue = (open as any[]).filter((b) => {
    const operationalDate = b.operational_date?.toString();
    return !!operationalDate && operationalDate <= todayISO;
  });

  // If cutoff reached: close all due OPEN batches. Older operational dates are always due,
  // which prevents a missed cron from leaving a prior business day OPEN indefinitely.
  if (hasReachedCutoff(now, flags.cutoff_time, AMSTERDAM_TIME_ZONE)) {
    const ids = openDue.map((b: any) => b.batch_id as number);
    return { toCloseIds: ids, reason: 'cutoff' };
  }

  const overdueIds = openDue
    .filter((b: any) => b.operational_date?.toString() < todayISO)
    .map((b: any) => b.batch_id as number);
  if (overdueIds.length > 0) {
    return { toCloseIds: overdueIds, reason: 'cutoff' };
  }

  // Else, evaluate by age or shipment threshold
  const toClose: number[] = [];
  for (const b of openDue as any[]) {
    const createdAt = b.created_at ? new Date(b.created_at) : null;
    const ageHours = createdAt ? (now.getTime() - createdAt.getTime()) / 3_600_000 : 0;
    if ((flags.batch_interval_hours && ageHours >= flags.batch_interval_hours) || (flags.shipment_threshold && (b.shipment_count ?? 0) >= flags.shipment_threshold)) {
      toClose.push(b.batch_id);
    }
  }
  return { toCloseIds: toClose, reason: 'interval_or_threshold' };
}

export async function closeBatchGuarded(batchId: number) {
  await setBatchStatusGuarded(batchId, 'OPEN', 'CLOSING');
  logger.info('batch_closed', { batch_id: batchId, timestamp: new Date().toISOString(), status: 'CLOSING' } as any);
}
