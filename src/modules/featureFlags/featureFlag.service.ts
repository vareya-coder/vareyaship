import { logger } from '@/utils/logger';

type LateShipmentMode = 'assign_to_next_day' | 'create_new_batch';

type Flags = {
  vacier_latam_customs_enabled: boolean;
  vacier_latam_dry_run: boolean;
  vacier_latam_countries: string[];
  vacier_latam_reference_value_eur: number;
  vacier_latam_processed_tag: string;
  vacier_latam_processing_start_date: string;
  vacier_latam_fulfillment_statuses: string[];
  vacier_latam_run_window_timezone: string;
  vacier_latam_run_window_start: string;
  vacier_latam_run_window_end: string;
  vacier_latam_max_pages_per_run: number;
  vacier_latam_max_orders_per_run: number;
  vacier_latam_max_shiphero_credits_per_run: number;
  cutoff_time: string; // HH:mm
  cutoff_timezone: string; // IANA TZ
  manifest_trigger_time: string; // HH:mm or values like 7pm
  manifest_trigger_timezone: string; // IANA TZ
  batch_interval_hours: number;
  shipment_threshold: number;
  enable_service_separation: boolean;
  enable_client_separation: boolean;
  late_shipment_mode: LateShipmentMode;
  retention_days: number;
  dry_run_manifest: boolean;
  dry_run_manifest_send_email: boolean;
  enable_manifest_verification: boolean;
  manifest_enabled_crm_ids: string[];
  enable_postnl_pickup_inference: boolean;
  postnl_pickup_account_ids: number[];
  postnl_pickup_confidence_threshold: number;
  enable_postnl_pickup_address_fallback: boolean;
  postnl_pickup_strict_address_match_required: boolean;
  postnl_pickup_max_distance_meters: number;
  postnl_pickup_log_only: boolean;
};

let cache: { value: Flags; expiresAt: number } | null = null;
const TTL_MS = 60_000; // 60s

function boolFromEnv(value: string | undefined, fallback = false): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (['1', 'true', 'y', 'yes'].includes(v)) return true;
  if (['0', 'false', 'n', 'no'].includes(v)) return false;
  return fallback;
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseInt((value ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatFromEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat((value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function intListFromEnv(value: string | undefined, fallback: number[]): number[] {
  const parsed = (value ?? '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item));
  return parsed.length > 0 ? parsed : fallback;
}

function strListFromEnv(value: string | undefined, fallback: string[]): string[] {
  const raw = (value ?? '').trim();
  if (raw === '') return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const list = parsed
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
      return list.length > 0 ? list : fallback;
    }
  } catch (_error) {
    // Fall through to comma-separated parsing.
  }

  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function strFromEnv(
  value: string | undefined,
  fallback: string,
): string {
  const v = (value ?? '').trim();
  return v === '' ? fallback : v;
}

export function getFlags(): Flags {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const cutoffTime = strFromEnv(process.env.CUTOFF_TIME ?? process.env.cutoff_time, '17:00');
  const cutoffTimezone = strFromEnv(
    process.env.CUTOFF_TIMEZONE ?? process.env.cutoff_timezone,
    'Europe/Amsterdam',
  );

  const flags: Flags = {
    vacier_latam_customs_enabled: boolFromEnv(
      process.env.VACIER_LATAM_CUSTOMS_ENABLED ?? process.env.vacier_latam_customs_enabled,
      false,
    ),
    vacier_latam_dry_run: boolFromEnv(
      process.env.VACIER_LATAM_DRY_RUN ?? process.env.vacier_latam_dry_run,
      true,
    ),
    vacier_latam_countries: strListFromEnv(
      process.env.VACIER_LATAM_COUNTRIES ?? process.env.vacier_latam_countries,
      ['EC', 'BR', 'AR'],
    ).map((country) => country.toUpperCase()),
    vacier_latam_reference_value_eur: floatFromEnv(
      process.env.VACIER_LATAM_REFERENCE_VALUE_EUR ?? process.env.vacier_latam_reference_value_eur,
      50,
    ),
    vacier_latam_processed_tag: strFromEnv(
      process.env.VACIER_LATAM_PROCESSED_TAG ?? process.env.vacier_latam_processed_tag,
      'vacier_latam_customs_adjusted_v1',
    ),
    vacier_latam_processing_start_date: strFromEnv(
      process.env.VACIER_LATAM_PROCESSING_START_DATE ?? process.env.vacier_latam_processing_start_date,
      '2026-05-01T00:00:00.000Z',
    ),
    vacier_latam_fulfillment_statuses: strListFromEnv(
      process.env.VACIER_LATAM_FULFILLMENT_STATUSES ?? process.env.vacier_latam_fulfillment_statuses,
      ['Vacier', 'unfulfilled'],
    ),
    vacier_latam_run_window_timezone: strFromEnv(
      process.env.VACIER_LATAM_RUN_WINDOW_TIMEZONE ?? process.env.vacier_latam_run_window_timezone,
      'Europe/Amsterdam',
    ),
    vacier_latam_run_window_start: strFromEnv(
      process.env.VACIER_LATAM_RUN_WINDOW_START ?? process.env.vacier_latam_run_window_start,
      '05:00',
    ),
    vacier_latam_run_window_end: strFromEnv(
      process.env.VACIER_LATAM_RUN_WINDOW_END ?? process.env.vacier_latam_run_window_end,
      '19:00',
    ),
    vacier_latam_max_pages_per_run: intFromEnv(
      process.env.VACIER_LATAM_MAX_PAGES_PER_RUN ?? process.env.vacier_latam_max_pages_per_run,
      0,
    ),
    vacier_latam_max_orders_per_run: intFromEnv(
      process.env.VACIER_LATAM_MAX_ORDERS_PER_RUN ?? process.env.vacier_latam_max_orders_per_run,
      0,
    ),
    vacier_latam_max_shiphero_credits_per_run: intFromEnv(
      process.env.VACIER_LATAM_MAX_SHIPHERO_CREDITS_PER_RUN ?? process.env.vacier_latam_max_shiphero_credits_per_run,
      0,
    ),
    cutoff_time: cutoffTime,
    cutoff_timezone: cutoffTimezone,
    manifest_trigger_time: strFromEnv(
      process.env.MANIFEST_TRIGGER_TIME ?? process.env.manifest_trigger_time,
      cutoffTime,
    ),
    manifest_trigger_timezone: strFromEnv(
      process.env.MANIFEST_TRIGGER_TIMEZONE ?? process.env.manifest_trigger_timezone,
      cutoffTimezone,
    ),
    batch_interval_hours: intFromEnv(
      process.env.BATCH_INTERVAL_HOURS ?? process.env.batch_interval_hours,
      24,
    ),
    shipment_threshold: intFromEnv(
      process.env.SHIPMENT_THRESHOLD ?? process.env.shipment_threshold,
      1000,
    ),
    enable_service_separation: boolFromEnv(
      process.env.ENABLE_SERVICE_SEPARATION ?? process.env.enable_service_separation,
      false,
    ),
    enable_client_separation: boolFromEnv(
      process.env.ENABLE_CLIENT_SEPARATION ?? process.env.enable_client_separation,
      false,
    ),
    late_shipment_mode: (strFromEnv(
      process.env.LATE_SHIPMENT_MODE ?? process.env.late_shipment_mode,
      'assign_to_next_day',
    ) as LateShipmentMode),
    retention_days: intFromEnv(
      process.env.RETENTION_DAYS ?? process.env.retention_days,
      30,
    ),
    dry_run_manifest: boolFromEnv(process.env.DRY_RUN_MANIFEST, false),
    dry_run_manifest_send_email: boolFromEnv(process.env.DRY_RUN_MANIFEST_SEND_EMAIL, false),
    enable_manifest_verification: boolFromEnv(
      process.env.ENABLE_MANIFEST_VERIFICATION ?? process.env.enable_manifest_verification,
      true,
    ),
    manifest_enabled_crm_ids: strListFromEnv(
      process.env.MANIFEST_ENABLED_CRM_IDS ?? process.env.manifest_enabled_crm_ids,
      [],
    ),
    enable_postnl_pickup_inference: boolFromEnv(
      process.env.ENABLE_POSTNL_PICKUP_INFERENCE ?? process.env.enable_postnl_pickup_inference,
      false,
    ),
    postnl_pickup_account_ids: intListFromEnv(
      process.env.POSTNL_PICKUP_ACCOUNT_IDS ?? process.env.postnl_pickup_account_ids,
      [85552],
    ),
    postnl_pickup_confidence_threshold: intFromEnv(
      process.env.POSTNL_PICKUP_CONFIDENCE_THRESHOLD ?? process.env.postnl_pickup_confidence_threshold,
      85,
    ),
    enable_postnl_pickup_address_fallback: boolFromEnv(
      process.env.ENABLE_POSTNL_PICKUP_ADDRESS_FALLBACK
        ?? process.env.enable_postnl_pickup_address_fallback,
      true,
    ),
    postnl_pickup_strict_address_match_required: boolFromEnv(
      process.env.POSTNL_PICKUP_STRICT_ADDRESS_MATCH_REQUIRED
        ?? process.env.postnl_pickup_strict_address_match_required,
      true,
    ),
    postnl_pickup_max_distance_meters: intFromEnv(
      process.env.POSTNL_PICKUP_MAX_DISTANCE_METERS ?? process.env.postnl_pickup_max_distance_meters,
      500,
    ),
    postnl_pickup_log_only: boolFromEnv(
      process.env.POSTNL_PICKUP_LOG_ONLY ?? process.env.postnl_pickup_log_only,
      true,
    ),
  };

  cache = { value: flags, expiresAt: now + TTL_MS };
  logger.info('feature_flags_loaded', flags as any);
  return flags;
}

export function isManifestEnabled(crmId?: string | null): boolean {
  const enabledCrmIds = getFlags().manifest_enabled_crm_ids;
  if (enabledCrmIds.length === 0) return true;
  return !!crmId && enabledCrmIds.includes(crmId);
}

export type { Flags, LateShipmentMode };
