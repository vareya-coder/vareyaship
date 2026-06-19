import {
  normalizeVacierLatamOverrideCountry,
  normalizeVacierLatamOverrideCustomsValue,
  normalizeVacierLatamOverrideSku,
} from './overrides.normalize';
import { logger } from '@/utils/logger';
import type { VacierLatamOverrideInput } from './overrides.repository';
import { invalidateVacierLatamLabelOverrideCache } from './labelOverrides.service';

export type VacierLatamResolvedOverride = {
  sku: string;
  customsValue: number;
  customsValueFormatted: string;
  currency: string;
  countryCode: string;
  source: string | null;
};

export type VacierLatamOverrideCandidate = {
  sku: string;
  customsValue: string | number;
  currency?: string | null;
  countryCode: string;
  isActive: boolean;
  source?: string | null;
};

export type VacierLatamOverrideImportResult = {
  imported: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
};

const REQUIRED_COLUMNS = ['SKU', 'ProductName', 'CustomsValue', 'Currency', 'CountryCode', 'Notes'];

export function resolveLatamOverrideFromRows(
  sku: string,
  destinationCountry: string,
  rows: VacierLatamOverrideCandidate[],
): VacierLatamResolvedOverride | null {
  const normalizedSku = normalizeVacierLatamOverrideSku(sku);
  const countryCode = normalizeVacierLatamOverrideCountry(destinationCountry);
  const activeRows = rows.filter((row) => row.isActive && normalizeVacierLatamOverrideSku(row.sku) === normalizedSku);
  const selected = activeRows.find((row) => normalizeVacierLatamOverrideCountry(row.countryCode) === countryCode)
    ?? activeRows.find((row) => normalizeVacierLatamOverrideCountry(row.countryCode) === 'ALL');

  if (!selected) return null;

  const customsValueFormatted = normalizeVacierLatamOverrideCustomsValue(selected.customsValue);
  return {
    sku: normalizedSku,
    customsValue: Number(customsValueFormatted),
    customsValueFormatted,
    currency: selected.currency?.trim().toUpperCase() || 'EUR',
    countryCode: normalizeVacierLatamOverrideCountry(selected.countryCode),
    source: selected.source ?? null,
  };
}

export async function resolveLatamOverrideForSku(
  sku: string,
  destinationCountry: string,
): Promise<VacierLatamResolvedOverride> {
  const normalizedSku = normalizeVacierLatamOverrideSku(sku);
  const countryCode = normalizeVacierLatamOverrideCountry(destinationCountry);
  const { resolveVacierLatamCustomsOverride } = await import('./overrides.repository');
  const row = await resolveVacierLatamCustomsOverride(normalizedSku, countryCode);

  if (!row) {
    throw new Error(`Missing active LATAM customs override for SKU ${normalizedSku} and country ${countryCode}`);
  }

  const customsValueFormatted = normalizeVacierLatamOverrideCustomsValue(row.customsValue);
  return {
    sku: row.sku,
    customsValue: Number(customsValueFormatted),
    customsValueFormatted,
    currency: row.currency,
    countryCode: row.countryCode,
    source: row.source ?? null,
  };
}

export async function listOverrides(filters: any) {
  const { listVacierLatamCustomsOverrides } = await import('./overrides.repository');
  return listVacierLatamCustomsOverrides(filters);
}

export async function saveOverride(input: VacierLatamOverrideInput) {
  const { upsertVacierLatamCustomsOverride } = await import('./overrides.repository');
  const saved = await upsertVacierLatamCustomsOverride(input);
  await invalidateCacheAfterMutation();
  return saved;
}

export async function editOverride(id: number, input: Partial<VacierLatamOverrideInput>) {
  const { updateVacierLatamCustomsOverride } = await import('./overrides.repository');
  const updated = await updateVacierLatamCustomsOverride(id, input);
  await invalidateCacheAfterMutation();
  return updated;
}

export async function deactivateOverride(id: number, updatedBy?: string | null) {
  const { deactivateVacierLatamCustomsOverride } = await import('./overrides.repository');
  const deactivated = await deactivateVacierLatamCustomsOverride(id, updatedBy);
  await invalidateCacheAfterMutation();
  return deactivated;
}

export async function importOverridesFromCsv(
  csv: string,
  options: { source?: string; updatedBy?: string } = {},
): Promise<VacierLatamOverrideImportResult> {
  const { upsertVacierLatamCustomsOverride } = await import('./overrides.repository');
  const rows = parseCsv(csv);
  const result: VacierLatamOverrideImportResult = { imported: 0, failed: 0, errors: [] };
  if (rows.length === 0) return result;

  const header = rows[0].map((value) => value.trim());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(', ')}`);
  }

  const index = new Map(header.map((column, idx) => [column, idx]));

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row.every((value) => value.trim() === '')) continue;

    try {
      await upsertVacierLatamCustomsOverride({
        sku: row[index.get('SKU')!],
        productName: row[index.get('ProductName')!],
        customsValue: row[index.get('CustomsValue')!],
        currency: row[index.get('Currency')!] || 'USD',
        countryCode: row[index.get('CountryCode')!] || 'ALL',
        notes: row[index.get('Notes')!],
        source: options.source ?? 'csv_import',
        updatedBy: options.updatedBy ?? 'csv_import',
        isActive: true,
      });
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ row: rowIndex + 1, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (result.imported > 0) {
    await invalidateCacheAfterMutation();
  }

  return result;
}

async function invalidateCacheAfterMutation(): Promise<void> {
  try {
    await invalidateVacierLatamLabelOverrideCache();
  } catch (error) {
    logger.warn('vacier_latam_customs_cache_invalidation_failed', {
      error: error instanceof Error ? error.message : String(error),
    } as any);
  }
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.length > 1 || row[0].trim() !== '') rows.push(row);
  return rows;
}
