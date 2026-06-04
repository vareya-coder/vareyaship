export function getConfiguredVacierLatamCountries(): string[] {
  return parseCountryList(process.env.VACIER_LATAM_COUNTRIES, ["EC", "BR", "AR"]);
}

export function isConfiguredVacierLatamCountry(countryCode: string | null | undefined): boolean {
  const normalized = normalizeCountryCode(countryCode);
  return !!normalized && getConfiguredVacierLatamCountries().includes(normalized);
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
  return normalized.length > 0 ? normalized : null;
}

function parseCountryList(value: string | undefined, fallback: string[]): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}
