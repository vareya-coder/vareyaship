import { logger } from '@/utils/logger';
import {
  deactivateVacierTurkeyCustomsOverride,
  listVacierTurkeyCustomsOverrides,
  updateVacierTurkeyCustomsOverride,
  upsertVacierTurkeyCustomsOverride,
  type VacierTurkeyCustomsOverrideFilters,
  type VacierTurkeyCustomsOverrideInput,
} from './customs.repository';
import { invalidateVacierTurkeyCustomsOverrideCache } from './customs.service';

export async function listTurkeyOverrides(filters: VacierTurkeyCustomsOverrideFilters = {}) {
  return listVacierTurkeyCustomsOverrides(filters);
}

export async function saveTurkeyOverride(input: VacierTurkeyCustomsOverrideInput) {
  const saved = await upsertVacierTurkeyCustomsOverride(input);
  await invalidateCacheAfterMutation();
  return saved;
}

export async function editTurkeyOverride(id: number, input: Partial<VacierTurkeyCustomsOverrideInput>) {
  const updated = await updateVacierTurkeyCustomsOverride(id, input);
  await invalidateCacheAfterMutation();
  return updated;
}

export async function deactivateTurkeyOverride(id: number) {
  const deactivated = await deactivateVacierTurkeyCustomsOverride(id);
  await invalidateCacheAfterMutation();
  return deactivated;
}

export async function importTurkeyOverridesFromCsv(csv: string) {
  const rows = parseCsv(csv);
  const result = {
    imported: 0,
    failed: 0,
    errors: [] as Array<{ row: number; message: string }>,
  };
  if (rows.length === 0) return result;

  const headers = rows[0].map((value) => value.trim());
  const index = new Map(headers.map((header, position) => [header, position]));
  const required = [
    ['SKU'],
    ['ProductName', 'Name'],
    ['CustomsDescription', 'Customs Description'],
    ['CustomsValue', 'Customs Value'],
    ['TariffCode', 'Tariff Code'],
  ];
  const missing = required
    .filter((aliases) => aliases.every((alias) => !index.has(alias)))
    .map((aliases) => aliases[0]);
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(', ')}`);
  }

  const valueAt = (row: string[], aliases: string[]) => {
    const header = aliases.find((alias) => index.has(alias));
    return header ? row[index.get(header)!] ?? '' : '';
  };

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row.every((value) => value.trim() === '')) continue;

    try {
      await upsertVacierTurkeyCustomsOverride({
        sku: valueAt(row, ['SKU']),
        productName: valueAt(row, ['ProductName', 'Name']),
        customsDescription: valueAt(row, ['CustomsDescription', 'Customs Description']),
        customsValue: valueAt(row, ['CustomsValue', 'Customs Value']),
        tariffCode: valueAt(row, ['TariffCode', 'Tariff Code']),
        currency: valueAt(row, ['Currency']) || 'EUR',
        source: valueAt(row, ['Source']) || 'csv_import',
        isActive: true,
      });
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        row: rowIndex + 1,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (result.imported > 0) await invalidateCacheAfterMutation();
  return result;
}

async function invalidateCacheAfterMutation() {
  try {
    await invalidateVacierTurkeyCustomsOverrideCache();
  } catch (error) {
    logger.warn('vacier_turkey_customs_cache_invalidation_failed', {
      error: error instanceof Error ? error.message : String(error),
    } as any);
  }
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
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
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.length > 1 || row[0].trim()) rows.push(row);
  return rows;
}
