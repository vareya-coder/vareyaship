import { logger } from '@/utils/logger';
import type { ShipHeroWebhook } from '@/app/utils/types';
import {
  normalizeVacierLatamOverrideCountry,
  normalizeVacierLatamOverrideCustomsValue,
  normalizeVacierLatamOverrideSku,
} from './overrides.normalize';
import type { VacierLatamOverrideRow } from './overrides.repository';

const CACHE_KEY = 'vacier-latam-customs:label-time:v1';
const DEFAULT_CACHE_TTL_SECONDS = 36 * 60 * 60;

type RedisResponse<T> = { result?: T; error?: string };

export type VacierLatamLabelOverride = {
  sku: string;
  productName: string | null;
  customsValue: number;
  customsValueFormatted: string;
  currency: string;
  countryCode: string;
  source: string | null;
};

export type VacierLatamLabelOverrideMap = Map<string, VacierLatamLabelOverride>;

export class VacierLatamCustomsDataError extends Error {
  readonly errorCode = 'VACIER_LATAM_CUSTOMS_DATA_ERROR';
  readonly sku?: string;
  readonly countryCode?: string;

  constructor(message: string, details: { sku?: string; countryCode?: string } = {}) {
    super(message);
    this.name = 'VacierLatamCustomsDataError';
    this.sku = details.sku;
    this.countryCode = details.countryCode;
  }
}

export function buildVacierLatamLabelOverrideMap(
  rows: Array<Pick<
    VacierLatamOverrideRow,
    'sku' | 'productName' | 'customsValue' | 'currency' | 'countryCode' | 'source'
  >>,
): VacierLatamLabelOverrideMap {
  const map: VacierLatamLabelOverrideMap = new Map();

  for (const row of rows) {
    const sku = normalizeVacierLatamOverrideSku(row.sku);
    const countryCode = normalizeVacierLatamOverrideCountry(row.countryCode);
    const customsValueFormatted = normalizeVacierLatamOverrideCustomsValue(row.customsValue);
    const currency = String(row.currency ?? '').trim().toUpperCase();
    if (!currency) {
      throw new VacierLatamCustomsDataError(`Missing currency for LATAM SKU ${sku}`, { sku, countryCode });
    }

    map.set(buildMapKey(sku, countryCode), {
      sku,
      productName: row.productName?.trim() || null,
      customsValue: Number(customsValueFormatted),
      customsValueFormatted,
      currency,
      countryCode,
      source: row.source ?? null,
    });
  }

  return map;
}

export function resolveVacierLatamLabelOverride(
  sku: string | null | undefined,
  destinationCountry: string | null | undefined,
  map: VacierLatamLabelOverrideMap | null | undefined,
): VacierLatamLabelOverride {
  const normalizedSku = normalizeVacierLatamOverrideSku(String(sku ?? ''));
  const countryCode = normalizeVacierLatamOverrideCountry(String(destinationCountry ?? ''));
  const resolved = map?.get(buildMapKey(normalizedSku, countryCode))
    ?? map?.get(buildMapKey(normalizedSku, 'ALL'));

  if (!resolved) {
    throw new VacierLatamCustomsDataError(
      `Missing active LATAM customs override for SKU ${normalizedSku} and country ${countryCode}`,
      { sku: normalizedSku, countryCode },
    );
  }

  return resolved;
}

export async function getVacierLatamLabelOverrideMap(): Promise<VacierLatamLabelOverrideMap> {
  try {
    const cached = await readCachedOverrideMap();
    if (cached) return cached;
  } catch (error) {
    logger.warn('vacier_latam_customs_cache_read_failed', {
      error: error instanceof Error ? error.message : String(error),
    } as any);
  }

  const { listVacierLatamCustomsOverrides } = await import('./overrides.repository');
  const rows = await listVacierLatamCustomsOverrides({ isActive: true, limit: 1000 });
  const map = buildVacierLatamLabelOverrideMap(rows);
  logger.info('vacier_latam_customs_loaded_from_db', { count: map.size } as any);

  try {
    await writeCachedOverrideMap(map);
  } catch (error) {
    logger.warn('vacier_latam_customs_cache_write_failed', {
      error: error instanceof Error ? error.message : String(error),
    } as any);
  }

  return map;
}

export function validateVacierLatamShipmentOverrides(
  shipmentData: Pick<ShipHeroWebhook, 'order_id' | 'order_number' | 'packages' | 'to_address'>,
  map: VacierLatamLabelOverrideMap,
): { currency: string; lineItemCount: number } {
  let currency: string | null = null;
  let lineItemCount = 0;

  for (const packageData of shipmentData.packages) {
    for (const lineItem of packageData.line_items ?? []) {
      if (lineItem.ignore_on_customs) continue;

      const override = resolveVacierLatamLabelOverride(
        lineItem.sku,
        shipmentData.to_address.country,
        map,
      );
      if (currency && currency !== override.currency) {
        throw new VacierLatamCustomsDataError(
          `Mixed LATAM customs currencies are not supported: ${currency} and ${override.currency}`,
          { sku: lineItem.sku, countryCode: shipmentData.to_address.country },
        );
      }
      currency = override.currency;
      lineItemCount += 1;
    }
  }

  if (lineItemCount === 0 || !currency) {
    throw new VacierLatamCustomsDataError(
      `No customs-included line items found for LATAM order ${shipmentData.order_number}`,
      { countryCode: shipmentData.to_address.country },
    );
  }

  return { currency, lineItemCount };
}

export async function invalidateVacierLatamLabelOverrideCache(): Promise<void> {
  if (!getRedisConfig()) return;
  await redisCommand<number>(['DEL', CACHE_KEY]);
}

export function isVacierLatamCustomsDataError(error: unknown): error is VacierLatamCustomsDataError {
  return error instanceof VacierLatamCustomsDataError;
}

function buildMapKey(sku: string, countryCode: string): string {
  return `${countryCode}|${sku}`;
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

function getCacheTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.VACIER_LATAM_CUSTOMS_CACHE_TTL_SECONDS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_TTL_SECONDS;
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

async function readCachedOverrideMap(): Promise<VacierLatamLabelOverrideMap | null> {
  const raw = await redisCommand<string | null>(['GET', CACHE_KEY]);
  if (!raw) return null;

  const records = JSON.parse(raw) as VacierLatamLabelOverride[];
  if (!Array.isArray(records)) return null;

  const map = buildVacierLatamLabelOverrideMap(records.map((record) => ({
    sku: record.sku,
    productName: record.productName,
    customsValue: record.customsValueFormatted ?? record.customsValue,
    currency: record.currency,
    countryCode: record.countryCode,
    source: record.source,
  })));
  logger.info('vacier_latam_customs_loaded_from_cache', { count: map.size } as any);
  return map;
}

async function writeCachedOverrideMap(map: VacierLatamLabelOverrideMap): Promise<void> {
  await redisCommand<string>([
    'SET',
    CACHE_KEY,
    JSON.stringify(Array.from(map.values())),
    'EX',
    String(getCacheTtlSeconds()),
  ]);
}
