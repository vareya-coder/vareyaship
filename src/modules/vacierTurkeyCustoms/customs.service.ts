import { AMSTERDAM_TIME_ZONE, getOperationalDateISO } from '@/modules/time/time';
import { logger } from '@/utils/logger';
import type { ShipHeroWebhook } from '@/app/utils/types';
import type { VacierTurkeyCustomsOverrideRow } from './customs.repository';

export const VACIER_ACCOUNT_ID = 73982;
export const VACIER_TURKEY_DESTINATION = 'TR';

const CACHE_PREFIX = 'vacier-turkey-customs:v1';
const DEFAULT_CACHE_TTL_SECONDS = 36 * 60 * 60;

type RedisResponse<T> = { result?: T; error?: string };

export type VacierTurkeyCustomsOverride = {
  sku: string;
  productName: string | null;
  customsDescription: string;
  customsValue: number;
  customsValueFormatted: string;
  tariffCode: string | null;
  currency: string;
  source: string | null;
};

export type VacierTurkeyCustomsOverrideMap = Map<string, VacierTurkeyCustomsOverride>;

export function normalizeVacierTurkeySku(sku: string | null | undefined): string {
  return String(sku ?? '').trim();
}

export function normalizeVacierTurkeyCountry(country: string | null | undefined): string {
  const normalized = String(country ?? '').trim().toUpperCase();
  return normalized === 'UK' ? 'GB' : normalized;
}

export function isVacierTurkeyShipment(shipmentData: Pick<ShipHeroWebhook, 'account_id' | 'to_address'>): boolean {
  return Number(shipmentData.account_id) === VACIER_ACCOUNT_ID
    && normalizeVacierTurkeyCountry(shipmentData.to_address?.country) === VACIER_TURKEY_DESTINATION;
}

export function buildVacierTurkeyCustomsOverrideMap(
  rows: Array<Pick<VacierTurkeyCustomsOverrideRow, 'sku' | 'productName' | 'customsDescription' | 'customsValue' | 'tariffCode' | 'currency' | 'source'>>,
): VacierTurkeyCustomsOverrideMap {
  const map: VacierTurkeyCustomsOverrideMap = new Map();

  for (const row of rows) {
    const sku = normalizeVacierTurkeySku(row.sku);
    if (!sku) continue;

    const formatted = normalizeCustomsValue(row.customsValue);
    map.set(sku, {
      sku,
      productName: row.productName?.trim() || null,
      customsDescription: row.customsDescription.trim(),
      customsValue: Number(formatted),
      customsValueFormatted: formatted,
      tariffCode: row.tariffCode?.trim() || null,
      currency: row.currency?.trim().toUpperCase() || 'EUR',
      source: row.source ?? null,
    });
  }

  return map;
}

export function resolveVacierTurkeyCustomsOverride(
  sku: string | null | undefined,
  map: VacierTurkeyCustomsOverrideMap | null | undefined,
): VacierTurkeyCustomsOverride | null {
  const normalizedSku = normalizeVacierTurkeySku(sku);
  if (!normalizedSku || !map) return null;
  return map.get(normalizedSku) ?? null;
}

export async function getVacierTurkeyCustomsOverrideMap(): Promise<VacierTurkeyCustomsOverrideMap> {
  const cacheKey = buildCacheKey();

  try {
    const cached = await readCachedOverrideMap(cacheKey);
    if (cached) return cached;
  } catch (error) {
    logger.warn('vacier_turkey_customs_cache_read_failed', {
      error: error instanceof Error ? error.message : String(error),
    } as any);
  }

  const map = await loadOverrideMapFromDb();

  try {
    await writeCachedOverrideMap(cacheKey, map);
  } catch (error) {
    logger.warn('vacier_turkey_customs_cache_write_failed', {
      error: error instanceof Error ? error.message : String(error),
    } as any);
  }

  return map;
}

export async function invalidateVacierTurkeyCustomsOverrideCache(): Promise<void> {
  if (!getRedisConfig()) return;
  await redisCommand<number>(['DEL', buildCacheKey()]);
}

async function loadOverrideMapFromDb(): Promise<VacierTurkeyCustomsOverrideMap> {
  const { listActiveVacierTurkeyCustomsOverrides } = await import('./customs.repository');
  const rows = await listActiveVacierTurkeyCustomsOverrides();
  const map = buildVacierTurkeyCustomsOverrideMap(rows);
  logger.info('vacier_turkey_customs_loaded_from_db', { count: map.size } as any);
  return map;
}

function normalizeCustomsValue(value: string | number): string {
  const numeric = typeof value === 'number'
    ? value
    : Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Vacier Turkey customs value must be a non-negative number');
  }
  return numeric.toFixed(2);
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

function getCacheTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.VACIER_TURKEY_CUSTOMS_CACHE_TTL_SECONDS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_TTL_SECONDS;
}

function buildCacheKey(now = new Date()): string {
  const date = getOperationalDateISO(now, AMSTERDAM_TIME_ZONE);
  return `${CACHE_PREFIX}:${date}`;
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

async function readCachedOverrideMap(cacheKey: string): Promise<VacierTurkeyCustomsOverrideMap | null> {
  const raw = await redisCommand<string | null>(['GET', cacheKey]);
  if (!raw) return null;

  const records = JSON.parse(raw) as VacierTurkeyCustomsOverride[];
  if (!Array.isArray(records)) return null;

  const map = buildVacierTurkeyCustomsOverrideMap(records.map((record) => ({
    sku: record.sku,
    productName: record.productName,
    customsDescription: record.customsDescription,
    customsValue: record.customsValueFormatted ?? record.customsValue,
    tariffCode: record.tariffCode,
    currency: record.currency,
    source: record.source,
  })));
  logger.info('vacier_turkey_customs_loaded_from_cache', { count: map.size } as any);
  return map;
}

async function writeCachedOverrideMap(cacheKey: string, map: VacierTurkeyCustomsOverrideMap): Promise<void> {
  await redisCommand<string>([
    'SET',
    cacheKey,
    JSON.stringify(Array.from(map.values())),
    'EX',
    String(getCacheTtlSeconds()),
  ]);
}
