import { logger } from '@/utils/logger';
import { getParcel } from '@/modules/asendia/parcels/getParcel';
import { listCustomerManifests } from '@/modules/asendia/manifests/listCustomerManifests';
import { getManifest } from '@/modules/asendia/manifests/getManifest';
import { getManifestParcels } from '@/modules/asendia/manifests/getManifestParcels';
import { fetchAndStoreManifestDocument } from './document.service';

const MANIFEST_SCAN_PAGE_SIZE = 100;

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

async function findManifestIdsByCustomerManifestScan(customerId: string, targetParcelIds: string[]): Promise<Map<string, string>> {
  const remainingParcelIds = new Set(targetParcelIds);
  const resolvedManifestIds = new Map<string, string>();
  const manifestParcelCache = new Map<string, string[]>();

  for (let page = 0; ; page += 1) {
    const manifests = await listCustomerManifests(customerId, page, MANIFEST_SCAN_PAGE_SIZE);
    if (manifests.length === 0) {
      break;
    }

    for (const manifest of manifests) {
      const manifestId = manifest.id ?? extractManifestIdFromLocation(manifest.manifestLocation);
      if (!manifestId) continue;

      let parcelIds = manifestParcelCache.get(manifestId);
      if (!parcelIds) {
        parcelIds = await getManifestParcels(manifestId);
        manifestParcelCache.set(manifestId, parcelIds);
      }
      for (const parcelId of parcelIds) {
        if (!remainingParcelIds.has(parcelId)) continue;
        resolvedManifestIds.set(parcelId, manifestId);
        remainingParcelIds.delete(parcelId);
      }

      if (remainingParcelIds.size === 0) {
        return resolvedManifestIds;
      }
    }

    if (manifests.length < MANIFEST_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return resolvedManifestIds;
}

async function resolveManifestIdForParcel(parcelId: string, customerId: string): Promise<string | null> {
  const parcel = await getParcel(parcelId);
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

  for (const shipment of shipments) {
    if (!shipment.parcel_id || !shipment.crm_id) {
      unrecoveredParcelIds.push(shipment.parcel_id ?? `shipment:${shipment.id}`);
      continue;
    }

    const existing = shipmentsByCustomer.get(shipment.crm_id) ?? [];
    existing.push(shipment);
    shipmentsByCustomer.set(shipment.crm_id, existing);
  }

  for (const [customerId, customerShipments] of shipmentsByCustomer.entries()) {
    const targetParcelIds = customerShipments
      .map((shipment) => shipment.parcel_id)
      .filter((parcelId): parcelId is string => !!parcelId);
    const recoveredFromCustomerManifests = await findManifestIdsByCustomerManifestScan(customerId, targetParcelIds);

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
        const manifestId = await resolveManifestIdForParcel(shipment.parcel_id, customerId);
        if (!manifestId) {
          unrecoveredParcelIds.push(shipment.parcel_id);
          continue;
        }

        const existing = manifestIdToParcelIds.get(manifestId) ?? [];
        existing.push(shipment.parcel_id);
        manifestIdToParcelIds.set(manifestId, existing);
      } catch (error: any) {
        logger.error('manifest_recovery_parcel_lookup_failed', {
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
      getManifest(manifestId),
      getManifestParcels(manifestId),
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

  return {
    recoveredGroups,
    unrecoveredParcelIds,
  };
}
