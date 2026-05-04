import { createAsendiaManifestApi, type AsendiaManifestApi } from './client';

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

export async function getManifest(manifestId: string, api?: AsendiaManifestApi): Promise<AsendiaManifestResponse> {
  const manifestApi = api ?? await createAsendiaManifestApi();
  const res = await manifestApi.get(`/api/manifests/${encodeURIComponent(manifestId)}`);
  return res.data as AsendiaManifestResponse;
}
