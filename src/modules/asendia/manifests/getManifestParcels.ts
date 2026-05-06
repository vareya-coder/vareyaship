import { createAsendiaManifestApi, type AsendiaManifestApi } from './client';
import { getPositiveIntFromEnv } from '@/utils/timeout';

const DEFAULT_MANIFEST_PARCELS_PAGE_SIZE = 250;
const DEFAULT_MANIFEST_PARCELS_MAX_PAGES = 50;

function extractParcelIds(data: any): string[] {
  const list = Array.isArray(data) ? data : (data?.parcelIds ?? []);
  return Array.isArray(list)
    ? list.filter((parcelId): parcelId is string => typeof parcelId === 'string' && parcelId.length > 0)
    : [];
}

export async function getManifestParcels(manifestId: string, api?: AsendiaManifestApi): Promise<string[]> {
  const manifestApi = api ?? await createAsendiaManifestApi();
  const size = getPositiveIntFromEnv(
    process.env.ASENDIA_MANIFEST_PARCELS_PAGE_SIZE,
    DEFAULT_MANIFEST_PARCELS_PAGE_SIZE,
  );
  const maxPages = getPositiveIntFromEnv(
    process.env.ASENDIA_MANIFEST_PARCELS_MAX_PAGES,
    DEFAULT_MANIFEST_PARCELS_MAX_PAGES,
  );
  const parcelIds: string[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page += 1) {
    const res = await manifestApi.get(`/api/manifests/${encodeURIComponent(manifestId)}/parcels`, {
      params: { page, size },
    });
    const pageParcelIds = extractParcelIds(res.data);

    if (pageParcelIds.length === 0) {
      break;
    }

    const previousCount = seen.size;
    for (const parcelId of pageParcelIds) {
      if (seen.has(parcelId)) continue;
      seen.add(parcelId);
      parcelIds.push(parcelId);
    }

    if (seen.size === previousCount) {
      break;
    }
  }

  return parcelIds;
}
