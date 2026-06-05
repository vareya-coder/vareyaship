import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { buildGroupingKey, getOrCreateOpenBatch } from '@/modules/batching/batch.service';
import { getShipmentOperationalDateISO, AMSTERDAM_TIME_ZONE } from '@/modules/time/time';
import { logger } from '@/utils/logger';
import type { IngestAsendiaShipmentInput } from './shipment.types';

const BUFFER_PREFIX = 'shipment-buffer:v1';
const BUFFER_BATCH_PREFIX = 'shipment-buffer-batch:v1';
const BUFFER_BATCH_LOCK_PREFIX = 'shipment-buffer-batch-lock:v1';
const DEFAULT_BUFFER_RETENTION_SECONDS = 3 * 24 * 60 * 60;
const DEFAULT_SCAN_COUNT = 250;
const DEFAULT_BATCH_LOCK_SECONDS = 10;
const DEFAULT_BATCH_LOCK_WAIT_MS = 150;
const DEFAULT_BATCH_LOCK_ATTEMPTS = 10;

type BufferedShipmentRecord = IngestAsendiaShipmentInput & {
  batch_id: number;
  operational_date: string;
  grouping_key: string | null;
  buffered_at: string;
};

type BufferedBatchRecord = {
  batch_id: number;
  operational_date: string;
  grouping_key: string | null;
  crm_id: string | null;
};

type RedisResponse<T> = { result?: T; error?: string };

function isTruthy(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return ['1', 'true', 'y', 'yes'].includes(normalized);
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

function getBufferRetentionSeconds(): number {
  const parsed = Number.parseInt(process.env.SHIPMENT_BUFFER_RETENTION_SECONDS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUFFER_RETENTION_SECONDS;
}

export function isShipmentBufferEnabled(): boolean {
  return isTruthy(process.env.SHIPMENT_BUFFER_ENABLED);
}

export function isShipmentBufferFlushEnabled(): boolean {
  return isTruthy(process.env.SHIPMENT_BUFFER_FLUSH_ENABLED);
}

export function isShipmentBufferUiReadsEnabled(): boolean {
  return isTruthy(process.env.SHIPMENT_BUFFER_UI_READS_ENABLED);
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  const config = getRedisConfig();
  if (!config) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upstash Redis command failed: ${response.status} ${response.statusText} ${body}`.trim());
  }

  const payload = (await response.json()) as RedisResponse<T>;
  if (payload.error) throw new Error(`Upstash Redis error: ${payload.error}`);
  return payload.result as T;
}

async function redisMGet(keys: string[]): Promise<Array<string | null>> {
  if (keys.length === 0) return [];
  return redisCommand<Array<string | null>>(['MGET', ...keys]);
}

async function redisMSet(records: Array<{ key: string; value: string }>): Promise<void> {
  if (records.length === 0) return;
  await redisCommand<string>([
    'MSET',
    ...records.flatMap((record) => [record.key, record.value]),
  ]);
}

function buildBufferKey(operationalDate: string, externalShipmentId: string): string {
  return `${BUFFER_PREFIX}:${operationalDate}:${externalShipmentId}`;
}

function encodeKeyPart(value: string | null | undefined, fallback: string): string {
  return encodeURIComponent(value && value.trim() !== '' ? value : fallback);
}

function buildBatchKey(params: { operationalDate: string; groupingKey: string | null; crmId?: string | null }): string {
  return [
    BUFFER_BATCH_PREFIX,
    params.operationalDate,
    encodeKeyPart(params.groupingKey, 'default'),
    encodeKeyPart(params.crmId ?? null, 'none'),
  ].join(':');
}

function buildBatchLockKey(batchKey: string): string {
  return `${BUFFER_BATCH_LOCK_PREFIX}:${batchKey}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCreatedAt(value: Date | string | null | undefined): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid shipment created_at: ${String(value)}`);
  return date;
}

function buildBufferedShipmentContext(input: IngestAsendiaShipmentInput) {
  const flags = getFlags();
  const createdAt = normalizeCreatedAt(input.created_at);
  const operationalDate = getShipmentOperationalDateISO(
    createdAt,
    flags.cutoff_time,
    AMSTERDAM_TIME_ZONE,
  );
  const groupingKey = buildGroupingKey({
    shipping_method: input.shipping_method,
    account_id: input.account_id,
    crm_id: input.crm_id,
  });

  return { createdAt, operationalDate, groupingKey };
}

export function buildBufferedShipmentRecord(
  input: IngestAsendiaShipmentInput,
  batchId: number,
): BufferedShipmentRecord {
  const context = buildBufferedShipmentContext(input);

  return {
    ...input,
    batch_id: batchId,
    created_at: context.createdAt.toISOString(),
    operational_date: context.operationalDate,
    grouping_key: context.groupingKey,
    buffered_at: new Date().toISOString(),
  };
}

async function readBufferedBatch(batchKey: string): Promise<BufferedBatchRecord | null> {
  const raw = await redisCommand<string | null>(['GET', batchKey]);
  if (!raw) return null;
  return JSON.parse(raw) as BufferedBatchRecord;
}

async function storeBufferedBatch(batchKey: string, record: BufferedBatchRecord): Promise<void> {
  await redisCommand<string>([
    'SET',
    batchKey,
    JSON.stringify(record),
    'EX',
    String(getBufferRetentionSeconds()),
  ]);
}

async function resolveBufferedBatch(input: IngestAsendiaShipmentInput): Promise<{
  batchId: number;
  operationalDate: string;
  groupingKey: string | null;
}> {
  const context = buildBufferedShipmentContext(input);
  const batchKey = buildBatchKey({
    operationalDate: context.operationalDate,
    groupingKey: context.groupingKey,
    crmId: input.crm_id,
  });

  const existing = await readBufferedBatch(batchKey);
  if (existing) {
    return {
      batchId: existing.batch_id,
      operationalDate: context.operationalDate,
      groupingKey: context.groupingKey,
    };
  }

  const lockKey = buildBatchLockKey(batchKey);
  const acquired = await redisCommand<string | null>([
    'SET',
    lockKey,
    '1',
    'NX',
    'EX',
    String(DEFAULT_BATCH_LOCK_SECONDS),
  ]);

  if (!acquired) {
    for (let attempt = 0; attempt < DEFAULT_BATCH_LOCK_ATTEMPTS; attempt += 1) {
      await sleep(DEFAULT_BATCH_LOCK_WAIT_MS);
      const mapped = await readBufferedBatch(batchKey);
      if (mapped) {
        return {
          batchId: mapped.batch_id,
          operationalDate: context.operationalDate,
          groupingKey: context.groupingKey,
        };
      }
    }
  }

  const batch = await getOrCreateOpenBatch({
    shipping_method: input.shipping_method,
    account_id: input.account_id,
    crm_id: input.crm_id,
    createdAt: context.createdAt,
  });
  const batchRecord: BufferedBatchRecord = {
    batch_id: batch.batch_id,
    operational_date: context.operationalDate,
    grouping_key: context.groupingKey,
    crm_id: input.crm_id ?? null,
  };
  await storeBufferedBatch(batchKey, batchRecord);
  await redisCommand<number>(['DEL', lockKey]).catch(() => undefined);

  return {
    batchId: batch.batch_id,
    operationalDate: context.operationalDate,
    groupingKey: context.groupingKey,
  };
}

export async function bufferAsendiaShipment(input: IngestAsendiaShipmentInput): Promise<BufferedShipmentRecord> {
  const batch = await resolveBufferedBatch(input);
  const record = buildBufferedShipmentRecord(input, batch.batchId);
  const key = buildBufferKey(record.operational_date, record.external_shipment_id);
  await redisCommand<string>([
    'SET',
    key,
    JSON.stringify(record),
    'EX',
    String(getBufferRetentionSeconds()),
  ]);
  logger.info('shipment_buffered', {
    external_shipment_id: record.external_shipment_id,
    parcel_id: record.parcel_id,
    batch_id: record.batch_id,
    operational_date: record.operational_date,
    grouping_key: record.grouping_key,
  } as any);
  return record;
}

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const result = await redisCommand<[string, string[]]>([
      'SCAN',
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      String(DEFAULT_SCAN_COUNT),
    ]);
    cursor = String(result?.[0] ?? '0');
    keys.push(...(result?.[1] ?? []));
  } while (cursor !== '0');
  return keys;
}

export async function listBufferedShipmentsForDate(operationalDate: string): Promise<BufferedShipmentRecord[]> {
  if (!isShipmentBufferUiReadsEnabled() && !isShipmentBufferFlushEnabled()) return [];
  const keys = await scanKeys(`${BUFFER_PREFIX}:${operationalDate}:*`);
  if (keys.length === 0) return [];

  const rawRecords = await redisMGet(keys);
  const records: BufferedShipmentRecord[] = [];
  const legacyRecords: Array<{ key: string; record: IngestAsendiaShipmentInput }> = [];

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const raw = rawRecords[index];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as BufferedShipmentRecord;
      if (typeof parsed.batch_id === 'number') {
        records.push(parsed);
      } else {
        legacyRecords.push({ key, record: parsed });
      }
    } catch (error) {
      logger.warn('shipment_buffer_parse_failed', { key, error: error instanceof Error ? error.message : String(error) } as any);
    }
  }

  if (legacyRecords.length > 0) {
    const batchCache = new Map<string, number>();
    const upgradedForWrite: Array<{ key: string; value: string }> = [];

    for (const legacy of legacyRecords) {
      try {
        const context = buildBufferedShipmentContext(legacy.record);
        const cacheKey = `${context.operationalDate}:${context.groupingKey ?? 'default'}:${legacy.record.crm_id ?? 'none'}`;
        let batchId = batchCache.get(cacheKey);
        if (!batchId) {
          const batch = await resolveBufferedBatch(legacy.record);
          batchId = batch.batchId;
          batchCache.set(cacheKey, batchId);
        }
        const upgraded = buildBufferedShipmentRecord(legacy.record, batchId);
        records.push(upgraded);
        upgradedForWrite.push({ key: legacy.key, value: JSON.stringify(upgraded) });
      } catch (error) {
        logger.warn('shipment_buffer_upgrade_failed', {
          key: legacy.key,
          error: error instanceof Error ? error.message : String(error),
        } as any);
      }
    }

    await redisMSet(upgradedForWrite);
  }

  return records;
}

export async function deleteBufferedShipment(record: Pick<BufferedShipmentRecord, 'operational_date' | 'external_shipment_id'>): Promise<void> {
  await redisCommand<number>(['DEL', buildBufferKey(record.operational_date, record.external_shipment_id)]);
}

export type { BufferedShipmentRecord };
