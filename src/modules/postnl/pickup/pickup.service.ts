import axios from 'axios';
import { ShipHeroWebhook } from '@/app/utils/types';
import { Flags, getFlags } from '@/modules/featureFlags/featureFlag.service';
import { logger } from '@/utils/logger';

type DeliveryType = 'HOME' | 'PG' | 'UNKNOWN';
type Decision = 'pickup_inferred' | 'fallback' | 'home_delivery';

type ParsedAddress = {
  street: string;
  houseNumber: string;
  houseNumberExt?: string;
};

type NormalizedPostNLOrder = {
  order_id: string;
  account_id: number;
  recipient: {
    name: string;
    address1: string;
    address2: string;
    city: string;
    postal_code: string;
    country: string;
    parsed_address: ParsedAddress | null;
  };
  raw: {
    company: string;
    original_address: ShipHeroWebhook['to_address'];
  };
  derived: {
    delivery_type: DeliveryType;
    location_code: string | null;
    inference_confidence: number;
  };
};

type PostNLLocation = {
  Area?: string;
  Buildingname?: string;
  City?: string;
  Countrycode?: string;
  DeliveryOptions?: unknown;
  Deliveryoptions?: unknown;
  Department?: string;
  Distance?: number | string;
  HouseNr?: number | string;
  HouseNrExt?: string;
  LocationCode?: number | string;
  Name?: string;
  PartnerName?: string;
  RetailFormulaName?: string;
  RetailNetworkID?: string;
  Street?: string;
  Zipcode?: string;
};

export type PostNLPickupLocation = {
  area?: string;
  buildingName?: string;
  city: string;
  countryCode: string;
  distance: number;
  houseNr: string;
  houseNrExt?: string;
  locationCode: string;
  name: string;
  partnerName?: string;
  retailFormulaName?: string;
  retailNetworkId?: string;
  street: string;
  zipcode: string;
};

export type PostNLPickupDecision = {
  decision: Decision;
  applyPickup: boolean;
  applyAddressFallback: boolean;
  confidence: number;
  location?: PostNLPickupLocation;
  matchedName?: string;
  reason?: string;
  rulesPassed: string[];
  companyValue: string;
  logOnly: boolean;
};

type InferenceResult = {
  location?: PostNLPickupLocation;
  confidence: number;
  matchedName?: string;
  reason: string;
  rulesPassed: string[];
};

const POSTNL_LOCATION_API_BASE = 'https://api.postnl.nl/shipment/v2_1/locations';
const LOCATION_REQUEST_TIMEOUT_MS = 5000;

export function normalizePostNLOrder(shipment: ShipHeroWebhook): NormalizedPostNLOrder {
  const country = normalizeCountryCode(shipment.to_address.country);

  return {
    order_id: String(shipment.order_id ?? shipment.order_number),
    account_id: shipment.account_id,
    recipient: {
      name: cleanText(shipment.to_address.name),
      address1: cleanText(shipment.to_address.address_1),
      address2: cleanText(shipment.to_address.address_2),
      city: cleanText(shipment.to_address.city),
      postal_code: normalizePostalCode(shipment.to_address.zip),
      country,
      parsed_address: parseDutchStreetAddress(shipment.to_address.address_1),
    },
    raw: {
      company: cleanText(shipment.to_address.company_name),
      original_address: shipment.to_address,
    },
    derived: {
      delivery_type: 'UNKNOWN',
      location_code: null,
      inference_confidence: 0,
    },
  };
}

export async function decidePostNLPickupHandling(
  shipment: ShipHeroWebhook,
  apiKey: string,
  flags: Flags = getFlags(),
): Promise<PostNLPickupDecision | null> {
  if (!flags.enable_postnl_pickup_inference) {
    return null;
  }

  if (!flags.postnl_pickup_account_ids.includes(shipment.account_id)) {
    return null;
  }

  const normalized = normalizePostNLOrder(shipment);
  const baseLog = {
    event: 'postnl_pickup_inference_result',
    order_id: normalized.order_id,
    account_id: normalized.account_id,
    company_value: normalized.raw.company,
    log_only: flags.postnl_pickup_log_only,
  };

  if (normalized.recipient.country !== 'NL') {
    const decision = buildHomeDecision(normalized, flags, 'country_not_supported');
    logDecision({ ...baseLog, ...decisionLog(decision) });
    return decision;
  }

  if (!normalized.raw.company) {
    const decision = buildHomeDecision(normalized, flags, 'missing_company_value');
    logDecision({ ...baseLog, ...decisionLog(decision) });
    return decision;
  }

  if (!normalized.recipient.parsed_address) {
    const decision = buildFallbackOrHomeDecision(normalized, flags, 'address_parse_failed');
    logDecision({ ...baseLog, ...decisionLog(decision) });
    return decision;
  }

  try {
    const locations = await fetchNearestPickupLocations(normalized, apiKey);
    const inference = inferPickupLocation(normalized, locations, flags);

    if (
      inference.location
      && inference.confidence >= flags.postnl_pickup_confidence_threshold
    ) {
      normalized.derived.delivery_type = 'PG';
      normalized.derived.location_code = inference.location.locationCode;
      normalized.derived.inference_confidence = inference.confidence;

      const decision: PostNLPickupDecision = {
        decision: 'pickup_inferred',
        applyPickup: !flags.postnl_pickup_log_only,
        applyAddressFallback: false,
        confidence: inference.confidence,
        location: inference.location,
        matchedName: inference.matchedName,
        rulesPassed: inference.rulesPassed,
        companyValue: normalized.raw.company,
        logOnly: flags.postnl_pickup_log_only,
      };

      logDecision({ ...baseLog, ...decisionLog(decision) });
      return decision;
    }

    const decision = buildFallbackOrHomeDecision(normalized, flags, inference.reason);
    logDecision({ ...baseLog, ...decisionLog(decision) });
    return decision;
  } catch (error) {
    logger.warn('postnl_pickup_inference_failed', {
      event: 'postnl_pickup_inference_failed',
      order_id: normalized.order_id,
      account_id: normalized.account_id,
      company_value: normalized.raw.company,
      error: error instanceof Error ? error.message : String(error),
    });

    const decision = buildFallbackOrHomeDecision(normalized, flags, 'location_lookup_failed');
    logDecision({ ...baseLog, ...decisionLog(decision) });
    return decision;
  }
}

export function inferPickupLocation(
  normalized: NormalizedPostNLOrder,
  locations: PostNLLocation[],
  flags: Pick<
    Flags,
    | 'postnl_pickup_strict_address_match_required'
    | 'postnl_pickup_max_distance_meters'
  >,
): InferenceResult {
  let best: PostNLPickupLocation | undefined;
  let bestScore = 0;
  let bestMatchedName: string | undefined;
  let bestRules: string[] = [];

  for (const location of locations) {
    const mapped = mapLocation(location);
    if (!mapped.locationCode || !mapped.name) {
      continue;
    }

    const supportsPG = locationSupportsPG(location);
    if (!supportsPG) {
      continue;
    }

    const nameMatches = fuzzyNameMatch(normalized.raw.company, mapped.name);
    if (!nameMatches) {
      continue;
    }

    const rulesPassed = ['name_match', 'pg_supported'];
    let score = 50;

    if (flags.postnl_pickup_strict_address_match_required) {
      if (!locationAddressMatches(normalized.recipient.parsed_address, mapped)) {
        continue;
      }

      score += 30;
      rulesPassed.push('address_match');
    }

    if (normalizePostalCode(mapped.zipcode) === normalized.recipient.postal_code) {
      score += 10;
      rulesPassed.push('postal_code_match');
    }

    if (
      Number.isFinite(mapped.distance)
      && mapped.distance <= flags.postnl_pickup_max_distance_meters
    ) {
      score += 10;
      rulesPassed.push('distance_ok');
    } else {
      continue;
    }

    if (score > bestScore) {
      best = mapped;
      bestScore = score;
      bestMatchedName = mapped.name;
      bestRules = rulesPassed;
    }
  }

  if (!best) {
    return {
      confidence: 0,
      reason: 'no_valid_inference',
      rulesPassed: [],
    };
  }

  return {
    location: best,
    confidence: bestScore,
    matchedName: bestMatchedName,
    reason: 'matched',
    rulesPassed: bestRules,
  };
}

export function parseDutchStreetAddress(address: string | null | undefined): ParsedAddress | null {
  const value = cleanText(address);
  if (!value) {
    return null;
  }

  const match = value.match(/^(.+?)\s+(\d+)\s*([A-Za-z]?(?:[-/]\s*[A-Za-z0-9]+)?)?$/);
  if (!match) {
    return null;
  }

  const street = cleanText(match[1]);
  const houseNumber = cleanText(match[2]);
  const houseNumberExt = cleanText(match[3]);

  if (!street || !houseNumber) {
    return null;
  }

  return {
    street,
    houseNumber,
    ...(houseNumberExt ? { houseNumberExt } : {}),
  };
}

async function fetchNearestPickupLocations(
  normalized: NormalizedPostNLOrder,
  apiKey: string,
): Promise<PostNLLocation[]> {
  if (!normalized.recipient.parsed_address) {
    return [];
  }

  const response = await axios.get(`${POSTNL_LOCATION_API_BASE}/nearest`, {
    params: {
      AllowSundaySorting: false,
      City: normalized.recipient.city,
      Countrycode: normalized.recipient.country,
      DeliveryDate: formatPostNLDate(addDays(new Date(), 1)),
      DeliveryOptions: 'PG',
      HouseNr: normalized.recipient.parsed_address.houseNumber,
      HouseNrExt: normalized.recipient.parsed_address.houseNumberExt,
      Options: 'Daytime',
      Postalcode: normalized.recipient.postal_code,
      Street: normalized.recipient.parsed_address.street,
    },
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    timeout: LOCATION_REQUEST_TIMEOUT_MS,
  });

  return extractLocations(response.data);
}

function extractLocations(data: unknown): PostNLLocation[] {
  if (Array.isArray(data)) {
    return data.filter(isPostNLLocation);
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const root = data as Record<string, unknown>;
  const candidates = [
    root.Locations,
    root.Location,
    root.ResponseLocation,
    getNested(root, ['Locations', 'Location']),
    getNested(root, ['GetNearestLocationsResult', 'ResponseLocation']),
    getNested(root, ['GetNearestLocationsResult', 'Locations', 'Location']),
    getNested(root, ['GetNearestLocationsResponse', 'GetNearestLocationsResult', 'ResponseLocation']),
    getNested(root, ['GetNearestLocationsResponse', 'GetNearestLocationsResult', 'Locations', 'Location']),
  ];

  for (const candidate of candidates) {
    const locations = toLocationArray(candidate);
    if (locations.length > 0) {
      return locations;
    }
  }

  return [];
}

function toLocationArray(value: unknown): PostNLLocation[] {
  if (Array.isArray(value)) {
    return value.filter(isPostNLLocation);
  }

  if (value && typeof value === 'object') {
    const nestedLocation = (value as Record<string, unknown>).Location;
    if (nestedLocation) {
      return toLocationArray(nestedLocation);
    }
  }

  if (isPostNLLocation(value)) {
    return [value];
  }

  return [];
}

function isPostNLLocation(value: unknown): value is PostNLLocation {
  return !!value
    && typeof value === 'object'
    && (
      'LocationCode' in value
      || 'Name' in value
      || 'Distance' in value
    );
}

function mapLocation(location: PostNLLocation): PostNLPickupLocation {
  return {
    area: cleanText(location.Area),
    buildingName: cleanText(location.Buildingname),
    city: cleanText(location.City),
    countryCode: normalizeCountryCode(location.Countrycode),
    distance: Number.parseInt(String(location.Distance ?? ''), 10),
    houseNr: cleanText(location.HouseNr),
    houseNrExt: cleanText(location.HouseNrExt),
    locationCode: cleanText(location.LocationCode),
    name: cleanText(location.Name),
    partnerName: cleanText(location.PartnerName),
    retailFormulaName: cleanText(location.RetailFormulaName),
    retailNetworkId: cleanText(location.RetailNetworkID),
    street: cleanText(location.Street),
    zipcode: normalizePostalCode(location.Zipcode),
  };
}

function locationSupportsPG(location: PostNLLocation): boolean {
  const options = location.DeliveryOptions ?? location.Deliveryoptions;
  if (!options) {
    return false;
  }

  if (typeof options === 'string') {
    return options.toUpperCase().split(/[^A-Z0-9]+/).includes('PG');
  }

  if (Array.isArray(options)) {
    return options.some((option) => String(option).toUpperCase() === 'PG');
  }

  if (typeof options === 'object') {
    const values = Object.values(options as Record<string, unknown>).flatMap((value) => {
      if (Array.isArray(value)) return value;
      return [value];
    });
    return values.some((value) => String(value).toUpperCase() === 'PG');
  }

  return false;
}

function locationAddressMatches(
  parsedAddress: ParsedAddress | null,
  location: PostNLPickupLocation,
): boolean {
  if (!parsedAddress) {
    return false;
  }

  return normalizeComparable(location.street) === normalizeComparable(parsedAddress.street)
    && normalizeComparable(location.houseNr) === normalizeComparable(parsedAddress.houseNumber);
}

function fuzzyNameMatch(company: string, locationName: string): boolean {
  const companyNorm = normalizeComparable(company);
  const locationNorm = normalizeComparable(locationName);
  if (!companyNorm || !locationNorm) {
    return false;
  }

  if (companyNorm.includes(locationNorm) || locationNorm.includes(companyNorm)) {
    return true;
  }

  const distance = levenshteinDistance(companyNorm, locationNorm);
  const maxLength = Math.max(companyNorm.length, locationNorm.length);
  return maxLength > 0 && 1 - distance / maxLength >= 0.72;
}

function buildFallbackOrHomeDecision(
  normalized: NormalizedPostNLOrder,
  flags: Flags,
  reason: string,
): PostNLPickupDecision {
  const canFallback = flags.enable_postnl_pickup_address_fallback
    && !!normalized.raw.company
    && !normalized.recipient.address2;

  if (canFallback) {
    return {
      decision: 'fallback',
      applyPickup: false,
      applyAddressFallback: !flags.postnl_pickup_log_only,
      confidence: 0,
      reason,
      rulesPassed: [],
      companyValue: normalized.raw.company,
      logOnly: flags.postnl_pickup_log_only,
    };
  }

  return buildHomeDecision(normalized, flags, reason);
}

function buildHomeDecision(
  normalized: NormalizedPostNLOrder,
  flags: Flags,
  reason: string,
): PostNLPickupDecision {
  return {
    decision: 'home_delivery',
    applyPickup: false,
    applyAddressFallback: false,
    confidence: 0,
    reason,
    rulesPassed: [],
    companyValue: normalized.raw.company,
    logOnly: flags.postnl_pickup_log_only,
  };
}

function decisionLog(decision: PostNLPickupDecision) {
  return {
    decision: decision.decision,
    confidence: decision.confidence,
    location_code: decision.location?.locationCode,
    matched_name: decision.matchedName,
    reason: decision.reason,
    rules_passed: decision.rulesPassed,
    apply_pickup: decision.applyPickup,
    apply_address_fallback: decision.applyAddressFallback,
  };
}

function logDecision(payload: Record<string, unknown>) {
  logger.info('postnl_pickup_inference_result', payload);
}

function getNested(root: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, root);
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeCountryCode(value: unknown): string {
  const country = cleanText(value).toUpperCase();
  return country === 'UK' ? 'GB' : country;
}

function normalizePostalCode(value: unknown): string {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

function normalizeComparable(value: unknown): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatPostNLDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}
