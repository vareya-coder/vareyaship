import { createAsendiaManifestApi } from './client';

export async function createManifest(parcelIds: string[]): Promise<{ manifestId: string; errorParcelIds: string[] }> {
  const api = await createAsendiaManifestApi();
  const res = await api.post('/api/manifests', parcelIds);
  const manifestId = res.data.id as string;
  const errorParcelIds: string[] = Array.isArray(res.data.errorParcelIds) ? res.data.errorParcelIds : [];
  return { manifestId, errorParcelIds };
}
