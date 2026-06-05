import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { buildGroupingKey } from '@/modules/batching/batch.service';
import { getShipmentOperationalDateISO, AMSTERDAM_TIME_ZONE } from '@/modules/time/time';
import { logger } from '@/utils/logger';
import type { IngestAsendiaShipmentInput } from './shipment.types';

const BUFFER_PREFIX = 'shipment-buffer:v1';
const DEFAULT_BUFFER_RETENTION_SECONDS = 3 * 24 * 60 * 60;
const DEFAULT_SCAN_COUNT = 250;

type BufferedShipmentRecord = IngestAsendiaShipmentInput & {
  operational_date: string;
  grouping_key: string | null;
  buffered_at: string;
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

function buildBufferKey(operationalDate: string, externalShipmentId: string): string {
  return `${BUFFER_PREFIX}:${operationalDate}:${externalShipmentId}`;
}

function normalizeCreatedAt(value: Date | string | null | undefined): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid shipment created_at: ${String(value)}`);
  return date;
}

export function buildBufferedShipmentRecord(input: IngestAsendiaShipmentInput): BufferedShipmentRecord {
  const flags = getFlags();
  const createdAt = normalizeCreatedAt(input.created_at);
  const operationalDate = getShipmentOperationalDateISO(
    createdAt,
    flags.cutoff_time,
    AMSTERDAM_TIME_ZONE,
  );

  return {
    ...input,
    created_at: createdAt.toISOString(),
    operational_date: operationalDate,
    grouping_key: buildGroupingKey({
      shipping_method: input.shipping_method,
      account_id: input.account_id,
      crm_id: input.crm_id,
    }),
    buffered_at: new Date().toISOString(),
  };
}

export async function bufferAsendiaShipment(input: IngestAsendiaShipmentInput): Promise<BufferedShipmentRecord> {
  const record = buildBufferedShipmentRecord(input);
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

  const records: BufferedShipmentRecord[] = [];
  for (const key of keys) {
    const raw = await redisCommand<string | null>(['GET', key]);
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as BufferedShipmentRecord);
    } catch (error) {
      logger.warn('shipment_buffer_parse_failed', { key, error: error instanceof Error ? error.message : String(error) } as any);
    }
  }
  return records;
}

export async function deleteBufferedShipment(record: Pick<BufferedShipmentRecord, 'operational_date' | 'external_shipment_id'>): Promise<void> {
  await redisCommand<number>(['DEL', buildBufferKey(record.operational_date, record.external_shipment_id)]);
}

export type { BufferedShipmentRecord };
