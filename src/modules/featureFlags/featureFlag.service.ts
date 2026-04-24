import { logger } from '@/utils/logger';

type LateShipmentMode = 'assign_to_last' | 'create_new_batch';

type Flags = {
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
      'assign_to_last',
    ) as LateShipmentMode),
    retention_days: intFromEnv(
      process.env.RETENTION_DAYS ?? process.env.retention_days,
      30,
    ),
    dry_run_manifest: boolFromEnv(process.env.DRY_RUN_MANIFEST, false),
  };

  cache = { value: flags, expiresAt: now + TTL_MS };
  logger.info('feature_flags_loaded', flags as any);
  return flags;
}

export type { Flags, LateShipmentMode };
