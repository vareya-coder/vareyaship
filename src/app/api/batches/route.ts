import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/modules/auth/session';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { getOperationalDateISO, hasReachedCutoff } from '@/modules/time/time';
import { listBatchShipments } from '@/modules/batching/batch.repository';
import {
  listActiveAsendiaCustomerMappingsByCrmId,
  listManifestUiBatchesForDate,
} from '@/modules/manifesting/manifestUi.repository';
import { logError } from '@/utils/logger';
import {
  isShipmentBufferUiReadsEnabled,
  listBufferedShipmentsForDate,
} from '@/modules/shipments/shipmentBuffer.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ShipmentForUi = {
  id: number;
  orderId: number | null;
  parcelId: string;
  trackingNumber: string | null;
  batchId: number | null;
  manifestId: string | null;
  shippingMethod: string | null;
  createdAt: string | null;
  isManifested: boolean;
};

function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const normalized = value.trim().toLowerCase();
  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    return {
      hour: Number.parseInt(hhmmMatch[1], 10),
      minute: Number.parseInt(hhmmMatch[2], 10),
    };
  }

  const ampmMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    const rawHour = Number.parseInt(ampmMatch[1], 10);
    const minute = Number.parseInt(ampmMatch[2] ?? '0', 10);
    const meridiem = ampmMatch[3];
    return {
      hour: meridiem === 'pm' && rawHour !== 12
        ? rawHour + 12
        : meridiem === 'am' && rawHour === 12
          ? 0
          : rawHour,
      minute,
    };
  }

  return { hour: 17, minute: 0 };
}

function localDateAndMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

function isLateShipment(createdAt: Date | string | null, operationalDate: string, cutoffTime: string, timeZone: string) {
  if (!createdAt) return false;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;

  const local = localDateAndMinutes(created, timeZone);
  const cutoff = parseTimeOfDay(cutoffTime);
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;

  return local.date === operationalDate && local.minutes > cutoffMinutes;
}

function mapShipment(shipment: any): ShipmentForUi {
  return {
    id: shipment.id,
    orderId: shipment.order_id ?? null,
    parcelId: shipment.parcel_id,
    trackingNumber: shipment.tracking_number ?? null,
    batchId: shipment.batch_id ?? null,
    manifestId: shipment.manifest_id ?? null,
    shippingMethod: shipment.shipping_method ?? null,
    createdAt: shipment.created_at ? new Date(shipment.created_at).toISOString() : null,
    isManifested: shipment.is_manifested === true,
  };
}

function batchCutoffApplied(input: {
  batchStatus?: string | null;
  closingAt?: Date | string | null;
  operationalDate: string | null;
  selectedDate: string;
  now: Date;
  cutoffTime: string;
  cutoffTimezone: string;
}) {
  if (input.batchStatus !== 'OPEN') return true;
  if (input.closingAt) return true;
  if (!input.operationalDate) return false;

  const today = getOperationalDateISO(input.now, input.cutoffTimezone);
  if (input.operationalDate < today) return true;
  if (input.operationalDate > today) return false;

  return input.selectedDate === today
    && hasReachedCutoff(input.now, input.cutoffTime, input.cutoffTimezone);
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const flags = getFlags();
    const now = new Date();
    const selectedDate = req.nextUrl.searchParams.get('date')
      ?? getOperationalDateISO(now, flags.cutoff_timezone);
    const batchIdFilterRaw = req.nextUrl.searchParams.get('batchId');
    const batchIdFilter = batchIdFilterRaw && batchIdFilterRaw !== 'all'
      ? Number.parseInt(batchIdFilterRaw, 10)
      : null;
    const crmIdFilter = req.nextUrl.searchParams.get('crmId');

    const [allDayBatches, customerMap] = await Promise.all([
      listManifestUiBatchesForDate(selectedDate, flags.cutoff_timezone),
      listActiveAsendiaCustomerMappingsByCrmId(),
    ]);
    const batches = (allDayBatches as any[]).filter((batch) => {
      if (batchIdFilter && batch.batch_id !== batchIdFilter) return false;
      if (crmIdFilter && crmIdFilter !== 'all' && batch.crm_id !== crmIdFilter) return false;
      return true;
    });
    const batchShipmentPairs = await Promise.all(
      (batches as any[]).map(async (batch) => ({
        batchId: batch.batch_id as number,
        shipments: await listBatchShipments(batch.batch_id),
      })),
    );
    const shipmentsByBatchId = new Map(
      batchShipmentPairs.map((entry) => [entry.batchId, entry.shipments as any[]]),
    );

    const summaries = (batches as any[]).map((batch) => {
      const shipmentsForBatch = shipmentsByBatchId.get(batch.batch_id) ?? [];
      const customer = batch.crm_id ? customerMap.get(batch.crm_id) : null;
      const totalShipmentCount = shipmentsForBatch.length;
      const manifestedShipmentCount = shipmentsForBatch
        .filter((shipment) => shipment.is_manifested === true).length;
      const pendingShipmentCount = totalShipmentCount - manifestedShipmentCount;
      const lateShipmentCount = shipmentsForBatch
        .filter((shipment) => isLateShipment(
          shipment.created_at,
          selectedDate,
          flags.cutoff_time,
          flags.cutoff_timezone,
        )).length;
      const cutoffApplied = batchCutoffApplied({
        batchStatus: batch.status ?? null,
        closingAt: batch.closing_at ?? null,
        operationalDate: batch.operational_date?.toString() ?? null,
        selectedDate,
        now,
        cutoffTime: flags.cutoff_time,
        cutoffTimezone: flags.cutoff_timezone,
      });
      const readyShipmentCount = Math.max(totalShipmentCount - lateShipmentCount, 0);
      const readinessPercent = totalShipmentCount === 0
        ? 0
        : Math.round((readyShipmentCount / totalShipmentCount) * 100);
      const readiness = lateShipmentCount === 0
        ? 'ready'
        : readyShipmentCount > 0
          ? 'partial'
          : 'risk';

      return {
        batchId: batch.batch_id,
        groupingKey: batch.grouping_key ?? null,
        crmId: batch.crm_id ?? null,
        clientName: customer?.customer_name ?? null,
        operationalDate: batch.operational_date?.toString() ?? selectedDate,
        status: batch.status ?? null,
        shipmentCountStored: batch.shipment_count ?? 0,
        shipmentCountActual: totalShipmentCount,
        manifestedShipmentCount,
        pendingShipmentCount,
        lateShipmentCount,
        cutoffApplied,
        readiness,
        readinessPercent,
        createdAt: batch.created_at ? new Date(batch.created_at).toISOString() : null,
        closingAt: batch.closing_at ? new Date(batch.closing_at).toISOString() : null,
      };
    });

    const lateShipments = (batches as any[]).flatMap((batch) => (
      (shipmentsByBatchId.get(batch.batch_id) ?? [])
        .filter((shipment) => isLateShipment(
          shipment.created_at,
          selectedDate,
          flags.cutoff_time,
          flags.cutoff_timezone,
        ))
        .map(mapShipment)
    ));

    let bufferStatus: 'db_only' | 'cache_plus_db' | 'cache_unavailable_db_fallback' = 'db_only';
    let bufferedShipmentCount = 0;
    if (isShipmentBufferUiReadsEnabled()) {
      try {
        const bufferedShipments = await listBufferedShipmentsForDate(selectedDate);
        bufferedShipmentCount = bufferedShipments.length;
        bufferStatus = bufferedShipmentCount > 0 ? 'cache_plus_db' : 'db_only';
      } catch (bufferError: any) {
        bufferStatus = 'cache_unavailable_db_fallback';
        logError('shipment_buffer_ui_read_failed', {
          error: bufferError?.message ?? 'unknown',
          selectedDate,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const totals = summaries.reduce((acc, batch) => {
      acc.batchCount += 1;
      acc.shipmentCount += batch.shipmentCountActual;
      acc.pendingShipmentCount += batch.pendingShipmentCount;
      acc.lateShipmentCount += batch.lateShipmentCount;
      if (batch.status === 'OPEN') acc.openBatchCount += 1;
      if (batch.status === 'CLOSING') acc.closingBatchCount += 1;
      if (batch.status === 'MANIFESTED') acc.manifestedBatchCount += 1;
      if (batch.readiness === 'risk') acc.riskBatchCount += 1;
      if (batch.readiness === 'partial') acc.partialBatchCount += 1;
      return acc;
    }, {
      batchCount: 0,
      shipmentCount: bufferedShipmentCount,
      pendingShipmentCount: 0,
      lateShipmentCount: 0,
      openBatchCount: 0,
      closingBatchCount: 0,
      manifestedBatchCount: 0,
      riskBatchCount: 0,
      partialBatchCount: 0,
    });

    type ClientFilterOption = {
      crmId: string;
      clientName: string | null;
      batchCount: number;
      shipmentCount: number;
    };
    const clientFilterOptions = Array.from(
      (allDayBatches as any[]).reduce((acc, batch) => {
          const crmId = batch.crm_id ?? null;
          if (!crmId) return acc;
          const existing = acc.get(crmId) ?? {
            crmId,
            clientName: customerMap.get(crmId)?.customer_name ?? null,
            batchCount: 0,
            shipmentCount: 0,
          };
          existing.batchCount += 1;
          existing.shipmentCount += batch.shipment_count ?? 0;
          acc.set(crmId, existing);
          return acc;
        }, new Map<string, ClientFilterOption>())
        .values(),
    ) as ClientFilterOption[];

    const filterOptions = {
      batches: (allDayBatches as any[]).map((batch) => {
        const customer = batch.crm_id ? customerMap.get(batch.crm_id) : null;
        return {
          batchId: batch.batch_id,
          crmId: batch.crm_id ?? null,
          clientName: customer?.customer_name ?? null,
          label: `Batch ${batch.batch_id}${batch.crm_id ? ` · ${batch.crm_id}` : ''}`,
        };
      }),
      clients: clientFilterOptions.sort((left, right) => left.crmId.localeCompare(right.crmId)),
    };

    return NextResponse.json({
      selectedDate,
      timezone: flags.cutoff_timezone,
      cutoffTime: flags.cutoff_time,
      pickupWindow: '20:00-22:00',
      systemStatus: flags.dry_run_manifest ? 'partial_manual_override' : 'auto_mode_active',
      systemStatusLabel: flags.dry_run_manifest ? 'Dry-run/manual mode' : 'Auto mode active',
      systemStatusDetail: flags.dry_run_manifest
        ? 'Dry-run manifest mode is enabled. The UI is live, but automatic manifest creation is not running as a live send.'
        : 'Manifest automation is live for cron-driven batch closing and manifest creation.',
      refreshedAt: now.toISOString(),
      totals,
      batches: summaries,
      lateShipments,
      filterOptions,
      dataSource: bufferStatus,
      bufferStatus,
      bufferedShipmentCount,
    });
  } catch (error: any) {
    logError('batch_monitor_api_failed', {
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ message: 'Failed to load batches' }, { status: 500 });
  }
}
