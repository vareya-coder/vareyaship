import { createAsendiaManifestApi } from './client';

export type AsendiaManifestResponse = {
  id: string;
  createdAt?: string;
  errorMessage?: string | null;
  errorParcelIds?: string[];
  status?: string;
  manifestDocumentLocation?: string;
  parcelsLocation?: string;
  manifestLocation?: string;
};

export async function getManifest(manifestId: string): Promise<AsendiaManifestResponse> {
  const api = await createAsendiaManifestApi();
  const res = await api.get(`/api/manifests/${encodeURIComponent(manifestId)}`);
  return res.data as AsendiaManifestResponse;
}
