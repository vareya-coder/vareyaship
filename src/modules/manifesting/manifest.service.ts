import { db } from '@/lib/db';
import { manifests, shipments } from '@/lib/db/schema';
import { logger } from '@/utils/logger';
import { createManifest } from '@/modules/asendia/manifests/createManifest';
import { fetchAndStoreManifestDocument } from './document.service';
import { verifyManifest } from './verification.service';
import { markShipmentsManifestedByParcelIds } from '@/modules/shipments/shipment.repository';
import { logEvent } from '@/modules/logging/events';
import { eq } from 'drizzle-orm';
import { notify } from '@/modules/notifications/notify';
import { setBatchStatusGuarded } from '@/modules/batching/batch.repository';

export async function manifestBatch(batchId: number, parcelIds: string[], options?: { dryRun?: boolean }) {
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
    logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'started' });
    const { manifestId, errorParcelIds } = await createManifest(parcelIds);

    // Insert manifest record
    await db.insert(manifests).values({
      manifest_id: manifestId,
      batch_id: batchId,
      status: 'created',
      parcel_count_expected: parcelIds.length,
      parcel_count_actual: null as any,
      verification_status: null as any,
      document_url: null as any,
    });

    // Partial failures handling
    const succeededParcelIds = errorParcelIds && errorParcelIds.length > 0 ? parcelIds.filter((id) => !errorParcelIds.includes(id)) : parcelIds;
    if (errorParcelIds && errorParcelIds.length > 0) {
      logEvent({ event: 'manifest_failed', batch_id: batchId, manifest_id: manifestId, status: 'partial', errorParcelIds });
      await notify('Manifest partial failure', `Batch ${batchId} manifest ${manifestId}, failed parcels: ${errorParcelIds.join(',')}`);
    }

    if (succeededParcelIds.length > 0) {
      await markShipmentsManifestedByParcelIds(succeededParcelIds);
    }

    // Verification
    const verification = await verifyManifest(manifestId, succeededParcelIds);
    const verificationStatus = verification.matched ? 'matched' : 'mismatch';

    if (!verification.matched) {
      logEvent({ event: 'verification_result', batch_id: batchId, manifest_id: manifestId, status: 'mismatch' });
      await notify('Manifest verification mismatch', `Batch ${batchId} manifest ${manifestId} mismatch.`);
    } else {
      logEvent({ event: 'verification_result', batch_id: batchId, manifest_id: manifestId, status: 'matched' });
    }

    // Document fetch & store
    const docUrl = await fetchAndStoreManifestDocument(manifestId);

    // Update manifest record
    await db.update(manifests).set({
      parcel_count_actual: verification.actual.length,
      verification_status: verificationStatus,
      document_url: docUrl ?? null as any,
      status: 'completed',
    }).where(eq(manifests.manifest_id, manifestId));

    // Transition batch to MANIFESTED (guarded from CLOSING)
    await setBatchStatusGuarded(batchId, 'CLOSING', 'MANIFESTED' as any);
    logEvent({ event: 'manifest_success', batch_id: batchId, manifest_id: manifestId, status: 'completed' });
    return { manifestId, errorParcelIds };
  } catch (error: any) {
    logger.error('manifest_failed', { batch_id: batchId, error: error?.message });
    logEvent({ event: 'manifest_failed', batch_id: batchId, status: 'error', errorMessage: String(error?.message ?? 'unknown') });
    throw error;
  }
}
