import { db } from '@/lib/db';
import { manifests, shipments } from '@/lib/db/schema';
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
import { withTimeout } from '@/utils/timeout';
import { logError, logInfo } from '@/utils/logger';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';

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

type ManifestLifecycleResult = {
  manifestId: string | null;
  errorParcelIds: string[];
  verificationMatched: boolean | null;
  verificationActualCount: number;
  documentUrl: string | null;
  recreated: boolean;
};

function assertBatchHasSingleCrm(params: {
  batchId: number;
  batchCrmId?: string | null;
  shipmentsForBatch: Array<{ id?: number | null; crm_id?: string | null }>;
}) {
  const shipmentsMissingCrm = params.shipmentsForBatch
    .filter((shipment) => !shipment.crm_id)
    .map((shipment) => shipment.id)
    .filter((shipmentId): shipmentId is number => typeof shipmentId === 'number');

  if (shipmentsMissingCrm.length > 0) {
    throw new Error(`Batch ${params.batchId} has shipments without crm_id: ${shipmentsMissingCrm.join(', ')}`);
  }

  const distinctCrmIds = Array.from(new Set(
    params.shipmentsForBatch
      .map((shipment) => shipment.crm_id)
      .filter((crmId): crmId is string => typeof crmId === 'string' && crmId.length > 0),
  ));

  if (distinctCrmIds.length > 1) {
    throw new Error(
      `Batch ${params.batchId} contains parcel ids from different customers: ${distinctCrmIds.join(', ') || 'unknown'}`,
    );
  }

  if (params.batchCrmId && distinctCrmIds.length > 0 && params.batchCrmId !== distinctCrmIds[0]) {
    throw new Error(
      `Batch ${params.batchId} crm_id ${params.batchCrmId} does not match shipment crm_id ${distinctCrmIds[0]}.`,
    );
  }
}

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

async function updateManifestCounts(params: {
  manifestId: string;
  actualCount: number;
  verificationStatus: string;
}) {
  await db.update(manifests).set({
    parcel_count_actual: params.actualCount,
    verification_status: params.verificationStatus,
  }).where(eq(manifests.manifest_id, params.manifestId));
}

function isFinalManifestState(input: {
  batchStatus?: string | null;
  manifest: ManifestRecord | null;
  shipments: Array<{ is_manifested: boolean | null; manifest_id?: string | null }>;
}): boolean {
  return input.batchStatus === 'MANIFESTED'
    && input.manifest?.status === 'completed'
    && !!input.manifest?.document_url
    && input.manifest?.verification_status !== null
    && input.shipments.length > 0
    && input.shipments.every((shipment) => shipment.is_manifested === true && !!shipment.manifest_id);
}

function allShipmentsManifested(shipmentsForBatch: Array<{ is_manifested: boolean | null; manifest_id?: string | null }>): boolean {
  return shipmentsForBatch.length > 0
    && shipmentsForBatch.every((shipment) => shipment.is_manifested === true && !!shipment.manifest_id);
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

function isAlreadyManifestedParcelError(error: any): boolean {
  const detail = String(error?.response?.data?.detail ?? '');
  const title = String(error?.response?.data?.title ?? '');
  return error?.response?.status === 400
    && (title.includes('already manifested parcels') || detail.includes('Already manifested parcels'));
}

async function executeManifestLifecycle(
  batchId: number,
  parcelIds: string[],
  options: ProcessManifestBatchOptions,
): Promise<ManifestLifecycleResult> {
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

  logInfo('manifest_create_attempt', {
    batch_id: batchId,
    source: options.source ?? 'cron',
    recreateExistingManifestId: options.recreateExistingManifestId ?? null,
    parcelCount: parcelIds.length,
    timestamp: new Date().toISOString(),
  });

  let manifestId: string;
  let errorParcelIds: string[];
  try {
    const result = await withTimeout(
      operation,
      60000,
      `Manifest create/recreate for batch ${batchId}`,
    );
    manifestId = result.manifestId;
    errorParcelIds = result.errorParcelIds;
  } catch (error: any) {
    logError('manifest_create_failed', {
      batch_id: batchId,
      source: options.source ?? 'cron',
      parcelIds,
      status: error?.response?.status ?? null,
      response: error?.response?.data ?? null,
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });

    if (isAlreadyManifestedParcelError(error)) {
      const alreadyManifestedError = new Error(
        `Asendia rejected manifest creation for batch ${batchId}: parcels are already manifested upstream.`,
      );
      (alreadyManifestedError as any).response = error?.response;
      throw alreadyManifestedError;
    }

    throw error;
  }

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
    await markShipmentsManifestedByParcelIds(succeededParcelIds, manifestId);
  }

  let verificationMatched: boolean | null = null;
  let verificationStatus = 'skipped';
  let actualParcelCount = succeededParcelIds.length;
  const verificationEnabled = getFlags().enable_manifest_verification;

  if (verificationEnabled) {
    try {
      const verification = await verifyManifest(manifestId, succeededParcelIds);
      verificationMatched = verification.matched;
      verificationStatus = verification.matched ? 'matched' : 'mismatch';
      actualParcelCount = verification.actual.length;

      logEvent({
        event: 'verification_result',
        batch_id: batchId,
        manifest_id: manifestId,
        status: verificationStatus,
        source: options.source ?? 'cron',
      });
    } catch (error: any) {
      verificationStatus = 'failed';
      logError('manifest_verification_failed', {
        batch_id: batchId,
        manifest_id: manifestId,
        source: options.source ?? 'cron',
        error: error?.message ?? 'unknown',
        timestamp: new Date().toISOString(),
      });
      logEvent({
        event: 'verification_result',
        batch_id: batchId,
        manifest_id: manifestId,
        status: 'failed',
        source: options.source ?? 'cron',
        errorMessage: error?.message ?? 'unknown',
      });
    }
  } else {
    logEvent({
      event: 'verification_result',
      batch_id: batchId,
      manifest_id: manifestId,
      status: 'skipped',
      source: options.source ?? 'cron',
    });
  }

  await updateManifestCounts({
    manifestId,
    actualCount: actualParcelCount,
    verificationStatus,
  });

  const docUrl = await fetchAndStoreManifestDocument(manifestId);
  await finalizeManifestRecord({
    manifestId,
    actualCount: actualParcelCount,
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

  if (notify && verificationMatched === false) {
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
    verificationMatched,
    verificationActualCount: actualParcelCount,
    documentUrl: docUrl ?? null,
    recreated: !!options.recreateExistingManifestId,
  };
}

export async function manifestBatch(batchId: number, parcelIds: string[], options?: ProcessManifestBatchOptions) {
  const dryRun = options?.dryRun === true;
  const requestedParcelIds = Array.from(new Set(parcelIds.filter((parcelId): parcelId is string => !!parcelId)));

  if (requestedParcelIds.length === 0) {
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'no_parcels', manifest_id: null });
    return { skipped: true };
  }

  const [batch, shipmentsForBatch, existingManifest] = await Promise.all([
    findBatchById(batchId),
    listBatchShipments(batchId),
    findLatestManifestForBatch(batchId),
  ]);

  assertBatchHasSingleCrm({
    batchId,
    batchCrmId: (batch as any)?.crm_id ?? null,
    shipmentsForBatch,
  });

  if (!options?.recreateExistingManifestId && isFinalManifestState({
    batchStatus: (batch as any)?.status,
    manifest: existingManifest,
    shipments: shipmentsForBatch,
  })) {
    logEvent({
      event: 'manifest_triggered',
      batch_id: batchId,
      manifest_id: existingManifest?.manifest_id ?? null,
      status: 'already_final',
      source: options?.source ?? 'cron',
    });
    return {
      skipped: true,
      reason: 'already_final',
      manifestId: existingManifest?.manifest_id ?? null,
    };
  }

  if (!options?.recreateExistingManifestId && (batch as any)?.status === 'MANIFESTED') {
    logEvent({
      event: 'manifest_triggered',
      batch_id: batchId,
      manifest_id: existingManifest?.manifest_id ?? null,
      status: 'already_manifested',
      source: options?.source ?? 'cron',
    });
    return {
      skipped: true,
      reason: 'already_manifested',
      manifestId: existingManifest?.manifest_id ?? null,
    };
  }

  const existingManifestedParcelIds = new Set(
    shipmentsForBatch
      .filter((shipment) => shipment.is_manifested === true && !!shipment.manifest_id)
      .map((shipment) => shipment.parcel_id)
      .filter((parcelId): parcelId is string => !!parcelId),
  );

  const requestedParcelIdSet = new Set(requestedParcelIds);
  const parcelIdsNeedingSync = shipmentsForBatch
    .filter((shipment) => !!shipment.parcel_id && requestedParcelIdSet.has(shipment.parcel_id))
    .filter((shipment) => !existingManifestedParcelIds.has(shipment.parcel_id))
    .map((shipment) => shipment.parcel_id as string);

  logInfo('manifest_batch_preflight', {
    batch_id: batchId,
    source: options?.source ?? 'cron',
    totalShipmentCount: shipmentsForBatch.length,
    requestedParcelCount: requestedParcelIds.length,
    existingManifestedParcelCount: existingManifestedParcelIds.size,
    parcelIdsNeedingSyncCount: parcelIdsNeedingSync.length,
    timestamp: new Date().toISOString(),
  });

  const currentManifestIds = Array.from(new Set(
    shipmentsForBatch
      .filter((shipment) => shipment.is_manifested === true && !!shipment.manifest_id)
      .map((shipment) => shipment.manifest_id as string),
  ));
  const parcelIdsToCreate = shipmentsForBatch
    .filter((shipment) => !!shipment.parcel_id)
    .map((shipment) => shipment.parcel_id as string)
    .filter((parcelId) => requestedParcelIdSet.has(parcelId))
    .filter((parcelId) => !existingManifestedParcelIds.has(parcelId));

  logInfo('manifest_batch_ready_to_create', {
    batch_id: batchId,
    source: options?.source ?? 'cron',
    existingManifestIds: currentManifestIds,
    parcelIdsToCreateCount: parcelIdsToCreate.length,
    timestamp: new Date().toISOString(),
  });

  if (parcelIdsToCreate.length === 0) {
    await ensureBatchClosing(batchId, (batch as any)?.status);
    const latestShipmentsForBatch = await listBatchShipments(batchId);
    if (allShipmentsManifested(latestShipmentsForBatch)) {
      await ensureBatchManifested(batchId, (batch as any)?.status === 'OPEN' ? 'CLOSING' : (batch as any)?.status);
    }
    return {
      skipped: true,
      manifestId: currentManifestIds.length === 1 ? currentManifestIds[0] : null,
      manifestIds: currentManifestIds,
    };
  }

  if (dryRun) {
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'dry_run', count: parcelIdsToCreate.length });
    return { skipped: true };
  }

  try {
    const result = await executeManifestLifecycle(batchId, parcelIdsToCreate, {
      ...options,
      source: options?.source ?? 'cron',
    });
    if (result.manifestId) {
      const latestShipmentsForBatch = await listBatchShipments(batchId);
      if (allShipmentsManifested(latestShipmentsForBatch)) {
        await ensureBatchManifested(batchId, 'CLOSING');
      }
    }
    return {
      manifestId: result.manifestId,
      errorParcelIds: result.errorParcelIds,
      documentUrl: result.documentUrl,
      verificationMatched: result.verificationMatched,
      verificationActualCount: result.verificationActualCount,
    };
  } catch (error: any) {
    logError('manifest_failed', { batch_id: batchId, error: error?.message, timestamp: new Date().toISOString() });
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
  assertBatchHasSingleCrm({
    batchId: input.batchId,
    batchCrmId: (batch as any).crm_id ?? null,
    shipmentsForBatch,
  });
  const batchShipmentManifestIds = Array.from(new Set(
    shipmentsForBatch
      .filter((shipment) => shipment.is_manifested === true && shipment.manifest_id)
      .map((shipment) => shipment.manifest_id as string),
  ));
  if (allShipmentsManifested(shipmentsForBatch)) {
    await ensureBatchClosing(input.batchId, (batch as any).status);
    await ensureBatchManifested(input.batchId, (batch as any).status === 'OPEN' ? 'CLOSING' : (batch as any).status);
    if (batchShipmentManifestIds.length === 1) {
      return {
        skipped: true,
        reason: 'already_manifested_upstream',
        batchId: input.batchId,
        manifestId: batchShipmentManifestIds[0],
      };
    }
    return {
      skipped: true,
      reason: 'already_manifested_multiple_manifests',
      batchId: input.batchId,
      manifestIds: batchShipmentManifestIds,
    };
  }

  const existingManifestedParcelIds = new Set(
    shipmentsForBatch
      .filter((shipment) => shipment.is_manifested === true && !!shipment.manifest_id)
      .map((shipment) => shipment.parcel_id)
      .filter((parcelId): parcelId is string => !!parcelId),
  );
  const parcelIds = shipmentsForBatch
    .map((shipment) => shipment.parcel_id)
    .filter((parcelId): parcelId is string => !!parcelId)
    .filter((parcelId) => !existingManifestedParcelIds.has(parcelId));

  if (parcelIds.length === 0) {
    await ensureBatchClosing(input.batchId, (batch as any).status);
    await ensureBatchManifested(input.batchId, (batch as any).status === 'OPEN' ? 'CLOSING' : (batch as any).status);
    if (batchShipmentManifestIds.length === 1) {
      return {
        skipped: true,
        reason: 'already_manifested_upstream',
        batchId: input.batchId,
        manifestId: batchShipmentManifestIds[0],
      };
    }
    return {
      skipped: true,
      reason: 'already_manifested_multiple_manifests',
      batchId: input.batchId,
      manifestIds: batchShipmentManifestIds,
    };
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
  if (result.manifestId) {
    const latestShipmentsForBatch = await listBatchShipments(input.batchId);
    if (allShipmentsManifested(latestShipmentsForBatch)) {
      await ensureBatchManifested(input.batchId, (batch as any).status === 'OPEN' ? 'CLOSING' : (batch as any).status);
    }
  }

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
