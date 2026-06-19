export function normalizeVacierLatamOverrideSku(sku: string): string {
  const normalized = String(sku ?? '').trim();
  if (!normalized) throw new Error('SKU is required');
  return normalized;
}

export function normalizeVacierLatamOverrideCountry(countryCode: string): string {
  const normalized = String(countryCode ?? '').trim().toUpperCase();
  if (!normalized) throw new Error('CountryCode is required');
  if (normalized !== 'ALL' && !/^[A-Z]{2}$/.test(normalized)) {
    throw new Error('CountryCode must be ISO2 or ALL');
  }
  return normalized;
}

export function normalizeVacierLatamOverrideCurrency(currency?: string | null): string {
  const normalized = String(currency ?? 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('Currency must be ISO3');
  return normalized;
}

export function normalizeVacierLatamOverrideCustomsValue(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error('CustomsValue must be a non-negative number');
  return numeric.toFixed(2);
}
