import { createAsendiaManifestApi, type AsendiaManifestApi } from './client';
import type { AsendiaManifestResponse } from './getManifest';

export async function listCustomerManifests(
  customerId: string,
  page: number,
  size: number,
  api?: AsendiaManifestApi,
): Promise<AsendiaManifestResponse[]> {
  const manifestApi = api ?? await createAsendiaManifestApi();
  const res = await manifestApi.get(`/api/customers/${encodeURIComponent(customerId)}/manifests`, {
    params: { page, size },
  });
  return Array.isArray(res.data) ? res.data as AsendiaManifestResponse[] : [];
}
