import { db } from '@/lib/db';
import { manifests, shipments } from '@/lib/db/schema';
import { logger } from '@/utils/logger';
import { createManifest } from '@/modules/asendia/manifests/createManifest';
import { fetchAndStoreManifestDocument } from './document.service';
import { verifyManifest } from './verification.service';
import { markShipmentsManifestedByParcelIds } from '@/modules/shipments/shipment.repository';
import { logEvent } from '@/modules/logging/events';
import { desc, eq } from 'drizzle-orm';
import { notifyManifestIssue } from '@/modules/notifications/notify';
import { findBatchById, listBatchShipments, setBatchStatusGuarded } from '@/modules/batching/batch.repository';
import { recreateManifest } from '@/modules/asendia/manifests/recreateManifest';
import { getManifest } from '@/modules/asendia/manifests/getManifest';

type ProcessManifestBatchOptions = {
  dryRun?: boolean;
  notify?: boolean;
  recreateExistingManifestId?: string | null;
  source?: 'cron' | 'manual';
};

type ManifestRecord = {
  manifest_id: string;
  batch_id: number | null;
  status: string | null;
  parcel_count_expected: number | null;
  parcel_count_actual: number | null;
  verification_status: string | null;
  document_url: string | null;
  created_at: Date | null;
};

async function findLatestManifestForBatch(batchId: number): Promise<ManifestRecord | null> {
  const rows = await db
    .select()
    .from(manifests)
    .where(eq(manifests.batch_id, batchId))
    .orderBy(desc(manifests.created_at), desc(manifests.manifest_id));
  return (rows[0] as ManifestRecord | undefined) ?? null;
}

async function upsertManifestStart(params: { manifestId: string; batchId: number; expectedCount: number }) {
  await db.insert(manifests).values({
    manifest_id: params.manifestId,
    batch_id: params.batchId,
    status: 'created',
    parcel_count_expected: params.expectedCount,
    parcel_count_actual: null as any,
    verification_status: null as any,
    document_url: null as any,
  }).onConflictDoUpdate({
    target: manifests.manifest_id,
    set: {
      batch_id: params.batchId,
      status: 'created',
      parcel_count_expected: params.expectedCount,
      parcel_count_actual: null as any,
      verification_status: null as any,
    },
  });
}

async function finalizeManifestRecord(params: {
  manifestId: string;
  actualCount: number;
  verificationStatus: string;
  documentUrl?: string;
}) {
  await db.update(manifests).set({
    parcel_count_actual: params.actualCount,
    verification_status: params.verificationStatus,
    document_url: params.documentUrl ?? null as any,
    status: 'completed',
  }).where(eq(manifests.manifest_id, params.manifestId));
}

function isFinalManifestState(input: {
  batchStatus?: string | null;
  manifest: ManifestRecord | null;
  shipments: Array<{ is_manifested: boolean | null }>;
}): boolean {
  return input.batchStatus === 'MANIFESTED'
    && input.manifest?.status === 'completed'
    && !!input.manifest?.document_url
    && input.manifest?.verification_status !== null
    && input.shipments.length > 0
    && input.shipments.every((shipment) => shipment.is_manifested === true);
}

async function ensureBatchClosing(batchId: number, batchStatus?: string | null) {
  if (batchStatus === 'OPEN') {
    await setBatchStatusGuarded(batchId, 'OPEN', 'CLOSING');
  }
}

async function ensureBatchManifested(batchId: number, batchStatus?: string | null) {
  if (batchStatus === 'CLOSING') {
    await setBatchStatusGuarded(batchId, 'CLOSING', 'MANIFESTED');
  }
}

async function executeManifestLifecycle(
  batchId: number,
  parcelIds: string[],
  options: ProcessManifestBatchOptions,
) {
  const notify = options.notify !== false;
  const occurredAt = new Date();
  const operation = options.recreateExistingManifestId
    ? async () => {
        await getManifest(options.recreateExistingManifestId as string);
        const result = await recreateManifest(options.recreateExistingManifestId as string);
        return {
          manifestId: result.id,
          errorParcelIds: Array.isArray(result.errorParcelIds) ? result.errorParcelIds : [],
        };
      }
    : async () => createManifest(parcelIds);

  logEvent({
    event: 'manifest_triggered',
    batch_id: batchId,
    manifest_id: options.recreateExistingManifestId ?? null,
    status: options.recreateExistingManifestId ? 'recreate_started' : 'started',
    source: options.source ?? 'cron',
  });

  const { manifestId, errorParcelIds } = await operation();
  await upsertManifestStart({
    manifestId,
    batchId,
    expectedCount: parcelIds.length,
  });

  const succeededParcelIds = errorParcelIds.length > 0
    ? parcelIds.filter((id) => !errorParcelIds.includes(id))
    : parcelIds;

  if (errorParcelIds.length > 0) {
    logEvent({
      event: 'manifest_failed',
      batch_id: batchId,
      manifest_id: manifestId,
      status: 'partial',
      errorParcelIds,
      source: options.source ?? 'cron',
    });
  }

  if (succeededParcelIds.length > 0) {
    await markShipmentsManifestedByParcelIds(succeededParcelIds);
  }

  const verification = await verifyManifest(manifestId, succeededParcelIds);
  const verificationStatus = verification.matched ? 'matched' : 'mismatch';

  if (!verification.matched) {
    logEvent({
      event: 'verification_result',
      batch_id: batchId,
      manifest_id: manifestId,
      status: 'mismatch',
      source: options.source ?? 'cron',
    });
  } else {
    logEvent({
      event: 'verification_result',
      batch_id: batchId,
      manifest_id: manifestId,
      status: 'matched',
      source: options.source ?? 'cron',
    });
  }

  const docUrl = await fetchAndStoreManifestDocument(manifestId);
  await finalizeManifestRecord({
    manifestId,
    actualCount: verification.actual.length,
    verificationStatus,
    documentUrl: docUrl,
  });

  if (notify && errorParcelIds.length > 0) {
    await notifyManifestIssue({
      kind: 'partial_failure',
      batchId,
      manifestId,
      occurredAt,
      failedParcelIds: errorParcelIds,
      documentUrl: docUrl,
    });
  }

  if (notify && !verification.matched) {
    await notifyManifestIssue({
      kind: 'verification_mismatch',
      batchId,
      manifestId,
      occurredAt,
      documentUrl: docUrl,
    });
  }

  logEvent({
    event: 'manifest_success',
    batch_id: batchId,
    manifest_id: manifestId,
    status: 'completed',
    source: options.source ?? 'cron',
  });

  return {
    manifestId,
    errorParcelIds,
    verificationMatched: verification.matched,
    verificationActualCount: verification.actual.length,
    documentUrl: docUrl ?? null,
    recreated: !!options.recreateExistingManifestId,
  };
}

export async function manifestBatch(batchId: number, parcelIds: string[], options?: ProcessManifestBatchOptions) {
  const dryRun = options?.dryRun === true;

  if (parcelIds.length === 0) {
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'no_parcels', manifest_id: null });
    return { skipped: true };
  }

  if (dryRun) {
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'dry_run', count: parcelIds.length });
    return { skipped: true };
  }

  try {
    const result = await executeManifestLifecycle(batchId, parcelIds, {
      ...options,
      source: options?.source ?? 'cron',
    });
    await ensureBatchManifested(batchId, 'CLOSING');
    return { manifestId: result.manifestId, errorParcelIds: result.errorParcelIds };
  } catch (error: any) {
    logger.error('manifest_failed', { batch_id: batchId, error: error?.message });
    logEvent({ event: 'manifest_failed', batch_id: batchId, status: 'error', errorMessage: String(error?.message ?? 'unknown') });
    throw error;
  }
}

export async function manualProcessBatchManifest(input: { batchId: number; manifestIdOverride?: string | null }) {
  logEvent({
    event: 'manifest_triggered',
    batch_id: input.batchId,
    manifest_id: input.manifestIdOverride ?? null,
    status: 'manual_started',
    source: 'manual',
  });

  const batch = await findBatchById(input.batchId);
  if (!batch) {
    throw new Error(`Batch ${input.batchId} not found.`);
  }

  const shipmentsForBatch = await listBatchShipments(input.batchId);
  const parcelIds = shipmentsForBatch
    .map((shipment) => shipment.parcel_id)
    .filter((parcelId): parcelId is string => !!parcelId);

  if (parcelIds.length === 0) {
    throw new Error(`Batch ${input.batchId} has no parcel_ids to process.`);
  }

  const existingManifest = input.manifestIdOverride
    ? await db.select().from(manifests).where(eq(manifests.manifest_id, input.manifestIdOverride)).then((rows) => rows[0] as ManifestRecord | undefined ?? null)
    : await findLatestManifestForBatch(input.batchId);

  if (isFinalManifestState({
    batchStatus: (batch as any).status,
    manifest: existingManifest,
    shipments: shipmentsForBatch,
  })) {
    logEvent({
      event: 'manifest_triggered',
      batch_id: input.batchId,
      manifest_id: existingManifest?.manifest_id ?? null,
      status: 'manual_already_final',
      source: 'manual',
    });
    return {
      skipped: true,
      reason: 'already_final',
      batchId: input.batchId,
      manifestId: existingManifest?.manifest_id ?? null,
    };
  }

  await ensureBatchClosing(input.batchId, (batch as any).status);
  const result = await executeManifestLifecycle(input.batchId, parcelIds, {
    notify: false,
    recreateExistingManifestId: input.manifestIdOverride ?? existingManifest?.manifest_id ?? null,
    source: 'manual',
  });
  await ensureBatchManifested(input.batchId, (batch as any).status === 'OPEN' ? 'CLOSING' : (batch as any).status);

  return {
    skipped: false,
    batchId: input.batchId,
    manifestId: result.manifestId,
    recreated: result.recreated,
    errorParcelIds: result.errorParcelIds,
    verificationMatched: result.verificationMatched,
    verificationActualCount: result.verificationActualCount,
    documentUrl: result.documentUrl,
  };
}
