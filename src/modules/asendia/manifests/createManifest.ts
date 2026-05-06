import { createAsendiaManifestApi } from './client';

export async function createManifest(parcelIds: string[]): Promise<{ manifestId: string; errorParcelIds: string[] }> {
  const api = await createAsendiaManifestApi();
  console.log(JSON.stringify(parcelIds));
  const res = await api.post('/api/manifests', parcelIds);
  console.log(JSON.stringify(res.data));
  const manifestId = res.data.id as string;
  const errorParcelIds: string[] = Array.isArray(res.data.errorParcelIds) ? res.data.errorParcelIds : [];
  return { manifestId, errorParcelIds };
}
