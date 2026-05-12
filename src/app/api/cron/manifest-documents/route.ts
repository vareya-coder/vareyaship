import { NextRequest, NextResponse } from 'next/server';
import { findBatchById, listBatchShipments } from '@/modules/batching/batch.repository';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import {
  listUploadedManifestsPendingSuccessNotification,
  markManifestSuccessNotified,
  processPendingManifestPdfs,
} from '@/modules/manifesting/document.service';
import { logEvent } from '@/modules/logging/events';
import { acquireDailyCronRun, completeCronRun, failCronRun } from '@/modules/cron/cronRun.repository';
import {
  AMSTERDAM_TIME_ZONE,
  getOperationalDateISO,
  hasReachedCutoff,
  isWithinLocalTimeWindow,
} from '@/modules/time/time';
import { notifyManifestTriggerFailure, notifyManifestTriggerSuccess } from '@/modules/notifications/notify';
import { logError, logInfo } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MANIFEST_DOCUMENTS_JOB = 'manifest-documents';
const MANIFEST_DOCUMENTS_LOCAL_TIME = '17:30';

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization');
  return token === `Bearer ${process.env.CRON_SECRET}`;
}

async function buildBatchSuccessSummary(batchId: number) {
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
    eligibleToCloseNow: false,
  };

  return {
    batch: batchSummary,
    totals: {
      batchCount: 1,
      shipmentCount: totalShipmentCount,
      manifestedShipmentCount,
      pendingShipmentCount,
      eligibleBatchCount: 0,
    },
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const flags = getFlags();
  const now = new Date();
  const operationalDate = getOperationalDateISO(now, flags.manifest_trigger_timezone);

  if (flags.dry_run_manifest) {
    return NextResponse.json({
      message: 'Manifest document cron skipped in dry-run mode',
      operationalDate,
      dryRun: true,
    });
  }

  if (!hasReachedCutoff(now, flags.manifest_trigger_time, flags.manifest_trigger_timezone)) {
    return NextResponse.json({
      message: 'Manifest document window has not opened yet',
      operationalDate,
      triggerTime: flags.manifest_trigger_time,
      triggerTimezone: flags.manifest_trigger_timezone,
    });
  }

  if (!isWithinLocalTimeWindow(now, MANIFEST_DOCUMENTS_LOCAL_TIME, AMSTERDAM_TIME_ZONE)) {
    return NextResponse.json({
      message: 'Manifest document cron ignored outside the scheduled Amsterdam window',
      operationalDate,
      scheduledLocalTime: MANIFEST_DOCUMENTS_LOCAL_TIME,
      scheduledTimezone: AMSTERDAM_TIME_ZONE,
      triggerTime: flags.manifest_trigger_time,
      triggerTimezone: flags.manifest_trigger_timezone,
    });
  }

  const runState = await acquireDailyCronRun(MANIFEST_DOCUMENTS_JOB, operationalDate);
  if (runState.state === 'completed') {
    return NextResponse.json({
      message: 'Manifest document cron already completed for this operational day',
      operationalDate,
    });
  }

  if (runState.state === 'in_progress') {
    return NextResponse.json({
      message: 'Manifest document cron is already in progress for this operational day',
      operationalDate,
    });
  }

  try {
    const pdfResult = await processPendingManifestPdfs(operationalDate, {
      now,
      cutoffTime: flags.cutoff_time,
      timeZone: flags.cutoff_timezone,
    }, String(runState.runId));

    const uploadedManifests = await listUploadedManifestsPendingSuccessNotification(operationalDate, {
      now,
      cutoffTime: flags.cutoff_time,
      timeZone: flags.cutoff_timezone,
    });

    const notifications: Array<{ manifestId: string; batchId: number | null; sent: boolean }> = [];
    const notificationFailures: Array<{ manifestId: string; batchId: number | null }> = [];

    for (const manifest of uploadedManifests) {
      if (!manifest.documentUrl || !manifest.batchId) {
        logEvent({
          event: 'notification_enqueued',
          batch_id: manifest.batchId ?? null,
          manifest_id: manifest.manifestId,
          status: 'skipped_missing_manifest_context',
        });
        continue;
      }

      const successSummary = await buildBatchSuccessSummary(manifest.batchId);
      const sent = await notifyManifestTriggerSuccess({
        operationalDate,
        occurredAt: new Date(),
        manifestUrl: manifest.documentUrl,
        totals: successSummary.totals,
        batch: successSummary.batch,
      });

      notifications.push({ manifestId: manifest.manifestId, batchId: manifest.batchId, sent });

      if (sent) {
        await markManifestSuccessNotified(manifest.manifestId);
      } else {
        notificationFailures.push({ manifestId: manifest.manifestId, batchId: manifest.batchId });
      }
    }

    if (notificationFailures.length > 0) {
      throw new Error(`Manifest success notification failed for ${notificationFailures.length} manifest(s): ${notificationFailures.map((failure) => failure.manifestId).join(', ')}`);
    }

    await completeCronRun(runState.runId);
    logInfo('manifest_documents_completed', {
      operationalDate,
      processedPdfCount: pdfResult.processed.length,
      notificationCount: notifications.length,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      message: 'Processed manifest documents',
      operationalDate,
      processedPdfs: pdfResult.processed,
      notifications,
    });
  } catch (error: any) {
    const errorMessage = String(error?.message ?? 'unknown');
    await failCronRun(runState.runId, errorMessage);
    logError('manifest_documents_failed', {
      operationalDate,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
    logEvent({ event: 'manifest_failed', status: 'document_cron_error', errorMessage });
    await notifyManifestTriggerFailure({
      operationalDate,
      errorMessage,
      occurredAt: new Date(),
    });
    return NextResponse.json({ message: 'Manifest document cron failed', error: errorMessage }, { status: 500 });
  }
}
