import { createAsendiaManifestApi, type AsendiaManifestApi } from './client';

export async function getManifestParcels(manifestId: string, api?: AsendiaManifestApi): Promise<string[]> {
  const manifestApi = api ?? await createAsendiaManifestApi();
  const res = await manifestApi.get(`/api/manifests/${encodeURIComponent(manifestId)}/parcels`);
  const list: string[] = Array.isArray(res.data) ? res.data : (res.data?.parcelIds ?? []);
  return list;
}
