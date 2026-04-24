import { createAsendiaManifestApi } from './client';
import type { AsendiaManifestResponse } from './getManifest';

export async function recreateManifest(manifestId: string): Promise<AsendiaManifestResponse> {
  const api = await createAsendiaManifestApi();
  const res = await api.put(`/api/manifests/${encodeURIComponent(manifestId)}`);
  return res.data as AsendiaManifestResponse;
}
