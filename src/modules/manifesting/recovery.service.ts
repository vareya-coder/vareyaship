import { getParcel } from '@/modules/asendia/parcels/getParcel';
import { listCustomerManifests } from '@/modules/asendia/manifests/listCustomerManifests';
import { getManifest } from '@/modules/asendia/manifests/getManifest';
import { getManifestParcels } from '@/modules/asendia/manifests/getManifestParcels';
import { createAsendiaManifestApi, type AsendiaManifestApi } from '@/modules/asendia/manifests/client';
import { fetchAndStoreManifestDocument } from './document.service';
import { getPositiveIntFromEnv } from '@/utils/timeout';

const MANIFEST_SCAN_PAGE_SIZE = 100;
const DEFAULT_MAX_MANIFEST_SCAN_PAGES = 50;
const DEFAULT_MANIFEST_SCAN_CONCURRENCY = 10;

export type RecoverableShipment = {
  id: number;
  parcel_id: string | null;
  crm_id: string | null;
  manifest_id?: string | null;
};

export type RecoveredManifestGroup = {
  manifestId: string;
  parcelIds: string[];
  actualParcelIds: string[];
  verificationMatched: boolean;
  documentUrl: string | null;
  status: string | null;
  createdAt: string | null;
};

function extractManifestIdFromLocation(location?: string | null): string | null {
  if (!location) return null;
  const match = location.match(/\/manifests\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function getManifestScanConcurrency(): number {
  return getPositiveIntFromEnv(process.env.ASENDIA_MANIFEST_SCAN_CONCURRENCY, DEFAULT_MANIFEST_SCAN_CONCURRENCY);
}

async function findManifestIdsByCustomerManifestScan(
  customerId: string,
  targetParcelIds: string[],
  api: AsendiaManifestApi,
): Promise<Map<string, string>> {
  const remainingParcelIds = new Set(targetParcelIds);
  const resolvedManifestIds = new Map<string, string>();
  const manifestParcelCache = new Map<string, string[]>();
  const maxPages = getPositiveIntFromEnv(process.env.ASENDIA_MANIFEST_SCAN_MAX_PAGES, DEFAULT_MAX_MANIFEST_SCAN_PAGES);
  const concurrency = getManifestScanConcurrency();

  console.log('manifest_recovery_customer_scan_started', {
    crm_id: customerId,
    targetParcelCount: targetParcelIds.length,
    maxPages,
    concurrency,
    pageSize: MANIFEST_SCAN_PAGE_SIZE,
    timestamp: new Date().toISOString(),
  });

  for (let page = 0; page < maxPages; page += 1) {
    let manifests;
    try {
      manifests = await listCustomerManifests(customerId, page, MANIFEST_SCAN_PAGE_SIZE, api);
    } catch (error: any) {
      console.error('manifest_recovery_customer_scan_failed', {
        crm_id: customerId,
        page,
        remainingParcelCount: remainingParcelIds.size,
        error: error?.message ?? 'unknown',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    console.log('manifest_recovery_customer_scan_page', {
      crm_id: customerId,
      page,
      manifestCount: manifests.length,
      remainingParcelCount: remainingParcelIds.size,
      timestamp: new Date().toISOString(),
    });

    if (manifests.length === 0) {
      break;
    }

    const manifestIds = manifests
      .map((manifest) => manifest.id ?? extractManifestIdFromLocation(manifest.manifestLocation))
      .filter((manifestId): manifestId is string => !!manifestId);

    for (let index = 0; index < manifestIds.length; index += concurrency) {
      const chunk = manifestIds.slice(index, index + concurrency);
      const results = await Promise.all(chunk.map(async (manifestId) => {
        let parcelIds = manifestParcelCache.get(manifestId);
        if (!parcelIds) {
          parcelIds = await getManifestParcels(manifestId, api);
          manifestParcelCache.set(manifestId, parcelIds);
        }
        return { manifestId, parcelIds };
      }));

      for (const result of results) {
        for (const parcelId of result.parcelIds) {
          if (!remainingParcelIds.has(parcelId)) continue;
          resolvedManifestIds.set(parcelId, result.manifestId);
          remainingParcelIds.delete(parcelId);
        }
      }

      console.log('manifest_recovery_customer_scan_chunk', {
        crm_id: customerId,
        page,
        chunkStart: index,
        chunkSize: chunk.length,
        remainingParcelCount: remainingParcelIds.size,
        timestamp: new Date().toISOString(),
      });

      if (remainingParcelIds.size === 0) {
        return resolvedManifestIds;
      }
    }

    if (manifests.length < MANIFEST_SCAN_PAGE_SIZE) {
      break;
    }
  }

  if (remainingParcelIds.size > 0) {
    console.warn('manifest_recovery_customer_scan_incomplete', {
      crm_id: customerId,
      unresolvedParcelCount: remainingParcelIds.size,
      unresolvedParcelIds: Array.from(remainingParcelIds),
      maxPages,
      timestamp: new Date().toISOString(),
    });
  } else {
    console.log('manifest_recovery_customer_scan_completed', {
      crm_id: customerId,
      resolvedParcelCount: resolvedManifestIds.size,
      timestamp: new Date().toISOString(),
    });
  }

  return resolvedManifestIds;
}

async function resolveManifestIdForParcel(parcelId: string, customerId: string, api: AsendiaManifestApi): Promise<string | null> {
  const parcel = await getParcel(parcelId, api);
  const manifestIdFromLocation = extractManifestIdFromLocation(parcel.manifestLocation);
  if (manifestIdFromLocation) {
    return manifestIdFromLocation;
  }

  return null;
}

export async function recoverManifestGroupsForShipments(shipments: RecoverableShipment[]): Promise<{
  recoveredGroups: RecoveredManifestGroup[];
  unrecoveredParcelIds: string[];
}> {
  const manifestIdToParcelIds = new Map<string, string[]>();
  const unrecoveredParcelIds: string[] = [];
  const shipmentsByCustomer = new Map<string, RecoverableShipment[]>();
  const startedAt = Date.now();
  const api = await createAsendiaManifestApi();

  for (const shipment of shipments) {
    if (!shipment.parcel_id || !shipment.crm_id) {
      unrecoveredParcelIds.push(shipment.parcel_id ?? `shipment:${shipment.id}`);
      continue;
    }

    const existing = shipmentsByCustomer.get(shipment.crm_id) ?? [];
    existing.push(shipment);
    shipmentsByCustomer.set(shipment.crm_id, existing);
  }

  console.log('manifest_recovery_started', {
    shipmentCount: shipments.length,
    customerCount: shipmentsByCustomer.size,
    timestamp: new Date().toISOString(),
  });

  for (const [customerId, customerShipments] of shipmentsByCustomer.entries()) {
    const targetParcelIds = customerShipments
      .map((shipment) => shipment.parcel_id)
      .filter((parcelId): parcelId is string => !!parcelId);
    const recoveredFromCustomerManifests = await findManifestIdsByCustomerManifestScan(customerId, targetParcelIds, api);

    for (const shipment of customerShipments) {
      if (!shipment.parcel_id) {
        unrecoveredParcelIds.push(`shipment:${shipment.id}`);
        continue;
      }

      const recoveredManifestId = recoveredFromCustomerManifests.get(shipment.parcel_id);
      if (recoveredManifestId) {
        const existing = manifestIdToParcelIds.get(recoveredManifestId) ?? [];
        existing.push(shipment.parcel_id);
        manifestIdToParcelIds.set(recoveredManifestId, existing);
        continue;
      }

      try {
        const manifestId = await resolveManifestIdForParcel(shipment.parcel_id, customerId, api);
        if (!manifestId) {
          unrecoveredParcelIds.push(shipment.parcel_id);
          continue;
        }

        const existing = manifestIdToParcelIds.get(manifestId) ?? [];
        existing.push(shipment.parcel_id);
        manifestIdToParcelIds.set(manifestId, existing);
      } catch (error: any) {
        console.error('manifest_recovery_parcel_lookup_failed', {
          shipment_id: shipment.id,
          parcel_id: shipment.parcel_id,
          crm_id: shipment.crm_id,
          error: error?.message ?? 'unknown',
        });
        unrecoveredParcelIds.push(shipment.parcel_id);
      }
    }
  }

  const recoveredGroups: RecoveredManifestGroup[] = [];

  for (const [manifestId, parcelIds] of manifestIdToParcelIds.entries()) {
    const [manifest, actualParcelIds, documentUrl] = await Promise.all([
      getManifest(manifestId, api),
      getManifestParcels(manifestId, api),
      fetchAndStoreManifestDocument(manifestId).catch(() => undefined),
    ]);
    const actualSet = new Set(actualParcelIds);
    const verificationMatched = parcelIds.every((parcelId) => actualSet.has(parcelId));

    recoveredGroups.push({
      manifestId,
      parcelIds,
      actualParcelIds,
      verificationMatched,
      documentUrl: documentUrl ?? null,
      status: manifest.status ?? null,
      createdAt: manifest.createdAt ?? null,
    });
  }

  console.log('manifest_recovery_completed', {
    shipmentCount: shipments.length,
    recoveredGroupCount: recoveredGroups.length,
    unrecoveredParcelCount: unrecoveredParcelIds.length,
    elapsedMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  });

  return {
    recoveredGroups,
    unrecoveredParcelIds,
  };
}
