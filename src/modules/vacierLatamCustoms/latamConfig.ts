import type { ShipHeroWebhook } from '@/app/utils/types';

export const VACIER_ACCOUNT_ID = 73982;

export function getConfiguredVacierLatamCountries(): string[] {
  return parseCountryList(process.env.VACIER_LATAM_COUNTRIES, ["EC", "BR", "AR"]);
}

export function isVacierLatamCustomsEnabled(): boolean {
  const normalized = String(process.env.VACIER_LATAM_CUSTOMS_ENABLED ?? '').trim().toLowerCase();
  return ['1', 'true', 'y', 'yes'].includes(normalized);
}

export function isConfiguredVacierLatamCountry(countryCode: string | null | undefined): boolean {
  const normalized = normalizeCountryCode(countryCode);
  return !!normalized && getConfiguredVacierLatamCountries().includes(normalized);
}

export function isVacierLatamShipment(
  shipmentData: Pick<ShipHeroWebhook, 'account_id' | 'to_address'>,
): boolean {
  return isVacierLatamCustomsEnabled()
    && Number(shipmentData.account_id) === VACIER_ACCOUNT_ID
    && isConfiguredVacierLatamCountry(shipmentData.to_address?.country);
}

export function getAsendiaReceiverTaxIdRequiredCountries(): string[] {
  return parseCountryList(process.env.VACIER_LATAM_ASENDIA_TAX_ID_COUNTRIES, ["EC", "BR", "AR"])
    .filter((country) => getConfiguredVacierLatamCountries().includes(country));
}

export function requiresAsendiaReceiverTaxId(countryCode: string | null | undefined): boolean {
  const normalized = normalizeCountryCode(countryCode);
  return !!normalized && getAsendiaReceiverTaxIdRequiredCountries().includes(normalized);
}

export function normalizeCountryCode(countryCode: string | null | undefined): string | null {
  const normalized = String(countryCode ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return normalized === 'UK' ? 'GB' : normalized;
}

function parseCountryList(value: string | undefined, fallback: string[]): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}
