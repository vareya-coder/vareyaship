import { createAsendiaManifestApi } from './client';

export async function getManifestParcels(manifestId: string): Promise<string[]> {
  const api = await createAsendiaManifestApi();
  const res = await api.get(`/api/manifests/${encodeURIComponent(manifestId)}/parcels`);
  const list: string[] = Array.isArray(res.data) ? res.data : (res.data?.parcelIds ?? []);
  return list;
}
