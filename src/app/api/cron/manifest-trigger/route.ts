import { NextRequest, NextResponse } from 'next/server';
import { evaluateBatchesForClosing, closeBatchGuarded } from '@/modules/batching/batch.service';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { getBatchShipments } from '@/modules/batching/batch.repository';
import { manifestBatch } from '@/modules/manifesting/manifest.service';
import { logEvent } from '@/modules/logging/events';
import { getOperationalDateISO, hasReachedCutoff } from '@/modules/time/time';
import { acquireDailyCronRun, completeCronRun, failCronRun } from '@/modules/cron/cronRun.repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MANIFEST_TRIGGER_JOB = 'manifest-trigger';

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization');
  return token === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const flags = getFlags();
  const now = new Date();
  const operationalDate = getOperationalDateISO(now, flags.manifest_trigger_timezone);

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

  try {
    const evalRes = await evaluateBatchesForClosing(now);
    const dryRun = !!flags.dry_run_manifest;

    if (evalRes.toCloseIds.length === 0) {
      await completeCronRun(runState.runId);
      return NextResponse.json({
        message: 'No eligible batches',
        operationalDate,
        reason: evalRes.reason,
        dryRun,
      });
    }

    const results: any[] = [];

    for (const batchId of evalRes.toCloseIds) {
      if (!dryRun) {
        await closeBatchGuarded(batchId);
      }
      const toManifestShipments = await getBatchShipments(batchId);
      const parcelIds = (toManifestShipments as any[]).map((s) => s.parcel_id).filter(Boolean);

      if (dryRun) {
        logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'dry_run', count: parcelIds.length });
        results.push({ batchId, dryRun: true, wouldManifestCount: parcelIds.length });
        continue;
      }

      const manifestRes = await manifestBatch(batchId, parcelIds);
      results.push({ batchId, manifestRes });
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
    logEvent({ event: 'manifest_failed', status: 'error', errorMessage });
    return NextResponse.json({ message: 'Manifest trigger failed', error: errorMessage }, { status: 500 });
  }
}
