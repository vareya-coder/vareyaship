import { logger } from '@/utils/logger';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { getOperationalDateISO, hasReachedCutoff } from '@/modules/time/time';
import { createBatch, findOpenBatch, incrementBatchShipmentCount, listOpenBatches, setBatchStatusGuarded, findLatestOpenBatchAnyDate } from './batch.repository';
import type { GroupingKey } from './batch.types';

export function buildGroupingKey(input: { shipping_method?: string | null; account_id?: number | null }): GroupingKey | null {
  const flags = getFlags();
  const parts: string[] = [];
  if (flags.enable_service_separation && input.shipping_method) {
    parts.push(`sm:${input.shipping_method}`);
  }
  if (flags.enable_client_separation && input.account_id) {
    parts.push(`acct:${input.account_id}`);
  }
  return parts.length > 0 ? parts.join('|') : null;
}

export async function getOrCreateOpenBatch(params: { shipping_method?: string | null; account_id?: number | null; now?: Date }): Promise<{ batch_id: number; operational_date: string }> {
  const now = params.now ?? new Date();
  const { cutoff_timezone } = getFlags();
  const operationalDateISO = getOperationalDateISO(now, cutoff_timezone);
  const groupingKey = buildGroupingKey({ shipping_method: params.shipping_method ?? null, account_id: params.account_id ?? null });

  const existing = await findOpenBatch(groupingKey, operationalDateISO);
  if (existing) {
    return { batch_id: (existing as any).batch_id, operational_date: operationalDateISO };
  }

  // Late shipment handling
  if (getFlags().late_shipment_mode === 'assign_to_last') {
    const latest = await findLatestOpenBatchAnyDate(groupingKey);
    if (latest) {
      return { batch_id: (latest as any).batch_id, operational_date: (latest as any).operational_date };
    }
  }

  const created = await createBatch({ groupingKey, operationalDateISO });
  logger.info('batch_created', { batch_id: created.batch_id, grouping_key: groupingKey, operational_date: operationalDateISO, timestamp: new Date().toISOString(), status: 'OPEN' } as any);
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

  // If cutoff reached: close all OPEN batches for today
  if (hasReachedCutoff(now, flags.cutoff_time, flags.cutoff_timezone)) {
    const todayISO = getOperationalDateISO(now, flags.cutoff_timezone);
    const ids = open.filter((b: any) => b.operational_date?.toString() === todayISO).map((b: any) => b.batch_id as number);
    return { toCloseIds: ids, reason: 'cutoff' };
  }

  // Else, evaluate by age or shipment threshold
  const toClose: number[] = [];
  for (const b of open as any[]) {
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
