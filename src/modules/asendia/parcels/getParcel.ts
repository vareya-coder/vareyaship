import { createAsendiaManifestApi, type AsendiaManifestApi } from '@/modules/asendia/manifests/client';
import type { AsendiaParcelResponse } from '@/app/utils/types';

export async function getParcel(parcelId: string, api?: AsendiaManifestApi): Promise<AsendiaParcelResponse> {
  const manifestApi = api ?? await createAsendiaManifestApi();
  const res = await manifestApi.get(`/api/parcels/${encodeURIComponent(parcelId)}`);
  return res.data as AsendiaParcelResponse;
}
