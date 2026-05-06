import { NextRequest, NextResponse } from 'next/server';
import { evaluateBatchesForClosing, closeBatchGuarded } from '@/modules/batching/batch.service';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import {
  findBatchById,
  getBatchShipments,
  listBatchesForOperationalDate,
  listBatchShipments,
} from '@/modules/batching/batch.repository';
import { manifestBatch } from '@/modules/manifesting/manifest.service';
import { logEvent } from '@/modules/logging/events';
import {
  getOperationalDateISO,
  getShipmentOperationalDateISO,
  hasReachedCutoff,
} from '@/modules/time/time';
import { acquireDailyCronRun, completeCronRun, failCronRun } from '@/modules/cron/cronRun.repository';
import { logError, logInfo, logger } from '@/utils/logger';
import {
  notifyManifestDryRunSummary,
  notifyManifestTriggerFailure,
  notifyManifestTriggerSuccess,
} from '@/modules/notifications/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
const MANIFEST_TRIGGER_JOB = 'manifest-trigger';

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization');
  return token === `Bearer ${process.env.CRON_SECRET}`;
}

function isShipmentEligibleForBatchOperationalDate(
  shipment: any,
  batchOperationalDate: string | null,
  cutoffTime: string,
  timeZone: string,
): boolean {
  if (!batchOperationalDate) return false;
  if (!shipment.created_at) return true;

  const createdAt = shipment.created_at instanceof Date
    ? shipment.created_at
    : new Date(shipment.created_at);
  if (Number.isNaN(createdAt.getTime())) return false;

  return getShipmentOperationalDateISO(createdAt, cutoffTime, timeZone) === batchOperationalDate;
}

function normalizeOperationalDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

async function buildDryRunSummary(operationalDate: string, now: Date) {
  const evalRes = await evaluateBatchesForClosing(now);
  const batchesForDay = await listBatchesForOperationalDate(operationalDate);
  const eligibleSet = new Set(evalRes.toCloseIds);

  const batchSummaries = await Promise.all(
    (batchesForDay as any[]).map(async (batch) => {
      const shipments = await listBatchShipments(batch.batch_id);
      const totalShipmentCount = shipments.length;
      const manifestedShipmentCount = shipments.filter((shipment) => shipment.is_manifested === true).length;
      const pendingShipmentCount = shipments.filter((shipment) => shipment.is_manifested !== true).length;

      return {
        batchId: batch.batch_id,
        status: batch.status ?? null,
        crmId: batch.crm_id ?? null,
        groupingKey: batch.grouping_key ?? null,
        shipmentCountStored: batch.shipment_count ?? 0,
        shipmentCountActual: totalShipmentCount,
        manifestedShipmentCount,
        pendingShipmentCount,
        eligibleToCloseNow: eligibleSet.has(batch.batch_id),
      };
    }),
  );

  const totals = batchSummaries.reduce((acc, batch) => {
    acc.batchCount += 1;
    acc.shipmentCount += batch.shipmentCountActual;
    acc.manifestedShipmentCount += batch.manifestedShipmentCount;
    acc.pendingShipmentCount += batch.pendingShipmentCount;
    if (batch.status === 'OPEN') acc.openBatchCount += 1;
    if (batch.status === 'CLOSING') acc.closingBatchCount += 1;
    if (batch.status === 'MANIFESTED') acc.manifestedBatchCount += 1;
    if (batch.eligibleToCloseNow) acc.eligibleBatchCount += 1;
    return acc;
  }, {
    batchCount: 0,
    shipmentCount: 0,
    manifestedShipmentCount: 0,
    pendingShipmentCount: 0,
    openBatchCount: 0,
    closingBatchCount: 0,
    manifestedBatchCount: 0,
    eligibleBatchCount: 0,
  });

  logEvent({
    event: 'manifest_triggered',
    status: 'dry_run_summary',
    operationalDate,
    batchCount: totals.batchCount,
    shipmentCount: totals.shipmentCount,
    manifestedShipmentCount: totals.manifestedShipmentCount,
    pendingShipmentCount: totals.pendingShipmentCount,
    eligibleBatchCount: totals.eligibleBatchCount,
    reason: evalRes.reason,
  });

  logger.info('manifest_trigger_dry_run_summary', {
    operationalDate,
    reason: evalRes.reason,
    totals,
    batches: batchSummaries,
  } as any);

  return {
    message: 'Dry run summary generated from database state',
    operationalDate,
    reason: evalRes.reason,
    dryRun: true,
    triggerTime: getFlags().manifest_trigger_time,
    triggerTimezone: getFlags().manifest_trigger_timezone,
    totals,
    batches: batchSummaries,
  };
}

async function buildBatchSuccessSummary(batchId: number, eligibleBatchIds: Set<number>) {
  const [batch, shipments] = await Promise.all([
    findBatchById(batchId),
    listBatchShipments(batchId),
  ]);
  const totalShipmentCount = shipments.length;
  const manifestedShipmentCount = shipments.filter((shipment) => shipment.is_manifested === true).length;
  const pendingShipmentCount = shipments.filter((shipment) => shipment.is_manifested !== true).length;
  const batchSummary = {
    batchId,
    status: (batch as any)?.status ?? null,
    crmId: (batch as any)?.crm_id ?? null,
    groupingKey: (batch as any)?.grouping_key ?? null,
    shipmentCountStored: (batch as any)?.shipment_count ?? 0,
    shipmentCountActual: totalShipmentCount,
    manifestedShipmentCount,
    pendingShipmentCount,
    eligibleToCloseNow: eligibleBatchIds.has(batchId),
  };

  return {
    batch: batchSummary,
    totals: {
      batchCount: 1,
      shipmentCount: totalShipmentCount,
      manifestedShipmentCount,
      pendingShipmentCount,
      eligibleBatchCount: batchSummary.eligibleToCloseNow ? 1 : 0,
    },
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const flags = getFlags();
  const dryRun = !!flags.dry_run_manifest;
  const now = new Date();
  const operationalDate = getOperationalDateISO(now, flags.manifest_trigger_timezone);

  if (dryRun) {
    const summary = await buildDryRunSummary(operationalDate, now);
    if (flags.dry_run_manifest_send_email) {
      await notifyManifestDryRunSummary({
        operationalDate,
        occurredAt: now,
        reason: summary.reason,
        totals: summary.totals,
        batches: summary.batches,
      });
    }
    return NextResponse.json(summary);
  }

  if (!hasReachedCutoff(now, flags.manifest_trigger_time, flags.manifest_trigger_timezone)) {
    return NextResponse.json({
      message: 'Manifest trigger window has not opened yet',
      operationalDate,
      triggerTime: flags.manifest_trigger_time,
      triggerTimezone: flags.manifest_trigger_timezone,
    });
  }

  const runState = await acquireDailyCronRun(MANIFEST_TRIGGER_JOB, operationalDate);
  if (runState.state === 'completed') {
    return NextResponse.json({
      message: 'Manifest trigger already completed for this operational day',
      operationalDate,
      triggerTime: flags.manifest_trigger_time,
      triggerTimezone: flags.manifest_trigger_timezone,
    });
  }

  if (runState.state === 'in_progress') {
    return NextResponse.json({
      message: 'Manifest trigger is already in progress for this operational day',
      operationalDate,
      triggerTime: flags.manifest_trigger_time,
      triggerTimezone: flags.manifest_trigger_timezone,
    });
  }

  let currentBatchId: number | null = null;

  try {
    const evalRes = await evaluateBatchesForClosing(now);
    const batchIdsToProcess = Array.from(new Set(evalRes.toCloseIds));
    const eligibleBatchIds = new Set(batchIdsToProcess);

    if (batchIdsToProcess.length === 0) {
      await completeCronRun(runState.runId);
      return NextResponse.json({
        message: 'No eligible batches',
        operationalDate,
        reason: evalRes.reason,
        dryRun,
      });
    }

    const results: any[] = [];

    if (!dryRun) {
      for (const batchId of evalRes.toCloseIds) {
        currentBatchId = batchId;
        await closeBatchGuarded(batchId);
      }
    }

    const failures: Array<{ batchId: number; error: string }> = [];

    for (const batchId of batchIdsToProcess) {
      currentBatchId = batchId;
      const batch = await findBatchById(batchId);
      const batchOperationalDate = normalizeOperationalDate((batch as any)?.operational_date);
      logInfo('manifest_trigger_batch_started', {
        batch_id: batchId,
        operational_date: batchOperationalDate ?? operationalDate,
        timestamp: new Date().toISOString(),
      });

      const toManifestShipments = await getBatchShipments(batchId);
      const parcelIds = (toManifestShipments as any[])
        .filter((shipment) => isShipmentEligibleForBatchOperationalDate(
          shipment,
          batchOperationalDate,
          flags.cutoff_time,
          flags.manifest_trigger_timezone,
        ))
        .map((s) => s.parcel_id)
        .filter(Boolean);

      if (dryRun) {
        logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'dry_run', count: parcelIds.length });
        results.push({ batchId, dryRun: true, wouldManifestCount: parcelIds.length });
        continue;
      }

      if (parcelIds.length === 0) {
        logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'no_parcels', manifest_id: null });
        results.push({ batchId, skipped: true, reason: 'no_eligible_parcels' });
        continue;
      }

      let manifestRes;
      try {
        manifestRes = await manifestBatch(batchId, parcelIds);
      } catch (error: any) {
        logError('manifest_trigger_batch_failed', {
          batch_id: batchId,
          operational_date: batchOperationalDate ?? operationalDate,
          error: error?.message ?? 'unknown',
          timestamp: new Date().toISOString(),
        });
        failures.push({ batchId, error: error?.message ?? 'unknown' });
        results.push({ batchId, error: error?.message ?? 'unknown' });
        continue;
      }
      logInfo('manifest_trigger_batch_completed', {
        batch_id: batchId,
        operational_date: batchOperationalDate ?? operationalDate,
        manifestRes,
        timestamp: new Date().toISOString(),
      });
      const errorParcelIds = Array.isArray((manifestRes as any)?.errorParcelIds)
        ? (manifestRes as any).errorParcelIds
        : [];
      const verificationMatched = (manifestRes as any)?.verificationMatched;
      const shouldSendSuccessNotification = (manifestRes as any)?.manifestId
        && !(manifestRes as any)?.skipped
        && errorParcelIds.length === 0
        && verificationMatched !== false;
      if (shouldSendSuccessNotification) {
        const successSummary = await buildBatchSuccessSummary(batchId, eligibleBatchIds);
        await notifyManifestTriggerSuccess({
          operationalDate: batchOperationalDate ?? operationalDate,
          occurredAt: new Date(),
          manifestUrl: (manifestRes as any).documentUrl ?? null,
          totals: successSummary.totals,
          batch: successSummary.batch,
        });
      }
      results.push({ batchId, manifestRes });
    }

    if (failures.length > 0) {
      currentBatchId = failures[0].batchId;
      throw new Error(`Manifest trigger failed for ${failures.length} batch(es): ${failures.map((failure) => failure.batchId).join(', ')}`);
    }

    await completeCronRun(runState.runId);
    return NextResponse.json({
      message: 'Processed batches',
      operationalDate,
      results,
      reason: evalRes.reason,
      dryRun,
    });
  } catch (error) {
    const errorMessage = String((error as Error)?.message ?? 'unknown');
    await failCronRun(runState.runId, errorMessage);
    logEvent({ event: 'manifest_failed', batch_id: currentBatchId, status: 'error', errorMessage });
    await notifyManifestTriggerFailure({
      operationalDate,
      batchId: currentBatchId,
      errorMessage,
      occurredAt: new Date(),
    });
    return NextResponse.json({ message: 'Manifest trigger failed', error: errorMessage }, { status: 500 });
  }
}
