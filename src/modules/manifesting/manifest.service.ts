import { db } from '@/lib/db';
import { manifests, shipments } from '@/lib/db/schema';
import { logger } from '@/utils/logger';
import { createManifest } from '@/modules/asendia/manifests/createManifest';
import { fetchAndStoreManifestDocument } from './document.service';
import { verifyManifest } from './verification.service';
import { markShipmentsManifestedByParcelIds, setManifestInfoForParcelIds } from '@/modules/shipments/shipment.repository';
import { logEvent } from '@/modules/logging/events';
import { desc, eq } from 'drizzle-orm';
import { notifyManifestIssue } from '@/modules/notifications/notify';
import { findBatchById, listBatchShipments, setBatchStatusGuarded } from '@/modules/batching/batch.repository';
import { recreateManifest } from '@/modules/asendia/manifests/recreateManifest';
import { getManifest } from '@/modules/asendia/manifests/getManifest';
import { recoverManifestGroupsForShipments } from './recovery.service';

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

  if (distinctCrmIds.length !== 1) {
    throw new Error(
      `Batch ${params.batchId} contains parcel ids from different customers: ${distinctCrmIds.join(', ') || 'unknown'}`,
    );
  }

  if (params.batchCrmId && params.batchCrmId !== distinctCrmIds[0]) {
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

async function upsertRecoveredManifestRecord(params: {
  manifestId: string;
  batchId: number;
  actualCount: number;
  verificationStatus: string;
  documentUrl?: string | null;
  status?: string | null;
}) {
  await db.insert(manifests).values({
    manifest_id: params.manifestId,
    batch_id: params.batchId,
    status: params.status ?? 'recovered',
    parcel_count_expected: params.actualCount,
    parcel_count_actual: params.actualCount,
    verification_status: params.verificationStatus,
    document_url: params.documentUrl ?? null as any,
  }).onConflictDoUpdate({
    target: manifests.manifest_id,
    set: {
      batch_id: params.batchId,
      status: params.status ?? 'recovered',
      parcel_count_expected: params.actualCount,
      parcel_count_actual: params.actualCount,
      verification_status: params.verificationStatus,
      document_url: params.documentUrl ?? null as any,
    },
  });
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

async function recoverAlreadyManifestedBatch(params: {
  batchId: number;
  parcelIds: string[];
  source?: 'cron' | 'manual';
}) {
  const shipmentsForBatch = await listBatchShipments(params.batchId);
  const targetShipments = shipmentsForBatch.filter(
    (shipment) => !!shipment.parcel_id && params.parcelIds.includes(shipment.parcel_id),
  );

  const recovery = await recoverManifestGroupsForShipments(targetShipments.map((shipment) => ({
    id: shipment.id as number,
    parcel_id: shipment.parcel_id ?? null,
    crm_id: shipment.crm_id ?? null,
    manifest_id: shipment.manifest_id ?? null,
  })));

  for (const group of recovery.recoveredGroups) {
    await setManifestInfoForParcelIds({
      parcelIds: group.parcelIds,
      manifestId: group.manifestId,
      isManifested: true,
    });
    await upsertRecoveredManifestRecord({
      manifestId: group.manifestId,
      batchId: params.batchId,
      actualCount: group.actualParcelIds.length,
      verificationStatus: group.verificationMatched ? 'matched' : 'mismatch',
      documentUrl: group.documentUrl,
      status: group.status ?? 'recovered',
    });
  }

  const recoveredParcelIds = recovery.recoveredGroups.flatMap((group) => group.parcelIds);
  const recoveredManifestIds = recovery.recoveredGroups.map((group) => group.manifestId);
  const allRecovered = recoveredParcelIds.length === params.parcelIds.length && recovery.unrecoveredParcelIds.length === 0;
  const uniqueManifestIds = Array.from(new Set(recoveredManifestIds));

  logEvent({
    event: 'manifest_recovered',
    batch_id: params.batchId,
    status: allRecovered ? 'recovered' : 'partial_recovery',
    source: params.source ?? 'cron',
    recoveredManifestIds: uniqueManifestIds,
    unrecoveredParcelIds: recovery.unrecoveredParcelIds,
  });

  return {
    recovered: recovery.recoveredGroups.length > 0,
    allRecovered,
    manifestIds: uniqueManifestIds,
    recoveredParcelIds,
    recoveredGroups: recovery.recoveredGroups,
    unrecoveredParcelIds: recovery.unrecoveredParcelIds,
    batchCanBeFinalized: allRecovered,
    multipleManifestIds: uniqueManifestIds.length > 1,
  };
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
    await markShipmentsManifestedByParcelIds(succeededParcelIds, manifestId);
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

async function executeManifestLifecycleWithRecovery(
  batchId: number,
  parcelIds: string[],
  options: ProcessManifestBatchOptions,
) {
  try {
    return await executeManifestLifecycle(batchId, parcelIds, options);
  } catch (error: any) {
    if (!isAlreadyManifestedParcelError(error)) {
      throw error;
    }

    const recovered = await recoverAlreadyManifestedBatch({
      batchId,
      parcelIds,
      source: options.source,
    });

    if (recovered.allRecovered) {
      if (recovered.manifestIds.length === 1) {
        return {
          manifestId: recovered.manifestIds[0],
          errorParcelIds: [],
          verificationMatched: recovered.recoveredGroups.every((group) => group.verificationMatched),
          verificationActualCount: recovered.recoveredGroups[0]?.actualParcelIds.length ?? parcelIds.length,
          documentUrl: recovered.recoveredGroups[0]?.documentUrl ?? null,
          recreated: false,
          recovered: true,
        };
      }

      return {
        manifestId: null,
        errorParcelIds: [],
        verificationMatched: recovered.recoveredGroups.every((group) => group.verificationMatched),
        verificationActualCount: recovered.recoveredGroups.reduce((sum, group) => sum + group.actualParcelIds.length, 0),
        documentUrl: null,
        recreated: false,
        recovered: true,
        recoveredManifestIds: recovered.manifestIds,
      };
    }

    const recoveryError = new Error(
      `Recovered upstream manifests for some parcels in batch ${batchId}, but could not resolve all parcel manifest ids. Recovered manifests: ${recovered.manifestIds.join(', ') || 'none'}. Unrecovered parcels: ${recovered.unrecoveredParcelIds.join(', ') || 'none'}.`,
    );
    (recoveryError as any).recoveredManifestIds = recovered.manifestIds;
    (recoveryError as any).unrecoveredParcelIds = recovered.unrecoveredParcelIds;
    throw recoveryError;
  }
}

export async function manifestBatch(batchId: number, parcelIds: string[], options?: ProcessManifestBatchOptions) {
  const dryRun = options?.dryRun === true;

  if (parcelIds.length === 0) {
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'no_parcels', manifest_id: null });
    return { skipped: true };
  }

  const [batch, shipmentsForBatch] = await Promise.all([
    findBatchById(batchId),
    listBatchShipments(batchId),
  ]);

  assertBatchHasSingleCrm({
    batchId,
    batchCrmId: (batch as any)?.crm_id ?? null,
    shipmentsForBatch,
  });

  const existingManifestedParcelIds = new Set(
    shipmentsForBatch
      .filter((shipment) => shipment.is_manifested === true && !!shipment.manifest_id)
      .map((shipment) => shipment.parcel_id)
      .filter((parcelId): parcelId is string => !!parcelId),
  );

  const parcelIdsNeedingSync = shipmentsForBatch
    .filter((shipment) => !!shipment.parcel_id && !existingManifestedParcelIds.has(shipment.parcel_id))
    .map((shipment) => shipment.parcel_id as string);

  const upstreamRecovery = parcelIdsNeedingSync.length > 0
    ? await recoverAlreadyManifestedBatch({
        batchId,
        parcelIds: parcelIdsNeedingSync,
        source: options?.source ?? 'cron',
      })
    : {
        recovered: false,
        allRecovered: true,
        manifestIds: [] as string[],
        recoveredParcelIds: [] as string[],
        recoveredGroups: [],
        unrecoveredParcelIds: [] as string[],
        batchCanBeFinalized: false,
        multipleManifestIds: false,
      };

  const recoveredParcelIds = new Set(upstreamRecovery.recoveredParcelIds);
  const currentManifestIds = Array.from(new Set([
    ...shipmentsForBatch
      .filter((shipment) => shipment.is_manifested === true && !!shipment.manifest_id)
      .map((shipment) => shipment.manifest_id as string),
    ...upstreamRecovery.manifestIds,
  ]));
  const parcelIdsToCreate = shipmentsForBatch
    .filter((shipment) => !!shipment.parcel_id)
    .map((shipment) => shipment.parcel_id as string)
    .filter((parcelId) => !existingManifestedParcelIds.has(parcelId) && !recoveredParcelIds.has(parcelId));

  if (parcelIdsToCreate.length === 0) {
    await ensureBatchClosing(batchId, (batch as any)?.status);
    await ensureBatchManifested(batchId, (batch as any)?.status === 'OPEN' ? 'CLOSING' : (batch as any)?.status);
    return {
      skipped: true,
      recovered: upstreamRecovery.recovered,
      recoveredManifestIds: currentManifestIds,
      manifestId: currentManifestIds.length === 1 ? currentManifestIds[0] : null,
    };
  }

  if (dryRun) {
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'dry_run', count: parcelIdsToCreate.length });
    return { skipped: true };
  }

  try {
    const result = await executeManifestLifecycleWithRecovery(batchId, parcelIdsToCreate, {
      ...options,
      source: options?.source ?? 'cron',
    });
    if (result.manifestId || (result as any).recoveredManifestIds?.length) {
      await ensureBatchManifested(batchId, 'CLOSING');
    }
    return {
      manifestId: result.manifestId,
      errorParcelIds: result.errorParcelIds,
      recovered: (result as any).recovered ?? false,
      recoveredManifestIds: (result as any).recoveredManifestIds ?? (result.manifestId ? [result.manifestId] : []),
    };
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
  if (shipmentsForBatch.length > 0 && shipmentsForBatch.every((shipment) => shipment.is_manifested === true && !!shipment.manifest_id)) {
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
  const parcelIdsNeedingSync = shipmentsForBatch
    .filter((shipment) => !!shipment.parcel_id && !existingManifestedParcelIds.has(shipment.parcel_id))
    .map((shipment) => shipment.parcel_id as string);
  const upstreamRecovery = parcelIdsNeedingSync.length > 0
    ? await recoverAlreadyManifestedBatch({
        batchId: input.batchId,
        parcelIds: parcelIdsNeedingSync,
        source: 'manual',
      })
    : {
        recovered: false,
        allRecovered: true,
        manifestIds: [] as string[],
        recoveredParcelIds: [] as string[],
        recoveredGroups: [],
        unrecoveredParcelIds: [] as string[],
        batchCanBeFinalized: false,
        multipleManifestIds: false,
      };
  const recoveredParcelIds = new Set(upstreamRecovery.recoveredParcelIds);
  const manifestIdsAfterRecovery = Array.from(new Set([
    ...batchShipmentManifestIds,
    ...upstreamRecovery.manifestIds,
  ]));
  const parcelIds = shipmentsForBatch
    .map((shipment) => shipment.parcel_id)
    .filter((parcelId): parcelId is string => !!parcelId)
    .filter((parcelId) => !existingManifestedParcelIds.has(parcelId) && !recoveredParcelIds.has(parcelId));

  if (parcelIds.length === 0) {
    await ensureBatchClosing(input.batchId, (batch as any).status);
    await ensureBatchManifested(input.batchId, (batch as any).status === 'OPEN' ? 'CLOSING' : (batch as any).status);
    if (manifestIdsAfterRecovery.length === 1) {
      return {
        skipped: true,
        reason: 'recovered_from_upstream_manifest',
        batchId: input.batchId,
        manifestId: manifestIdsAfterRecovery[0],
      };
    }
    return {
      skipped: true,
      reason: 'recovered_from_multiple_upstream_manifests',
      batchId: input.batchId,
      manifestIds: manifestIdsAfterRecovery,
    };
  }

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
  const result = await executeManifestLifecycleWithRecovery(input.batchId, parcelIds, {
    notify: false,
    recreateExistingManifestId: input.manifestIdOverride ?? existingManifest?.manifest_id ?? null,
    source: 'manual',
  });
  if (result.manifestId || (result as any).recoveredManifestIds?.length) {
    await ensureBatchManifested(input.batchId, (batch as any).status === 'OPEN' ? 'CLOSING' : (batch as any).status);
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
    recovered: (result as any).recovered ?? false,
    recoveredManifestIds: (result as any).recoveredManifestIds ?? (result.manifestId ? [result.manifestId] : []),
  };
}
