import { createAsendiaManifestApi } from './client';
import type { AsendiaManifestResponse } from './getManifest';

export async function listCustomerManifests(customerId: string, page: number, size: number): Promise<AsendiaManifestResponse[]> {
  const api = await createAsendiaManifestApi();
  const res = await api.get(`/api/customers/${encodeURIComponent(customerId)}/manifests`, {
    params: { page, size },
  });
  return Array.isArray(res.data) ? res.data as AsendiaManifestResponse[] : [];
}
