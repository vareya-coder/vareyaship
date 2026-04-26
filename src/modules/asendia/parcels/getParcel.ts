import { createAsendiaManifestApi } from '@/modules/asendia/manifests/client';
import type { AsendiaParcelResponse } from '@/app/utils/types';

export async function getParcel(parcelId: string): Promise<AsendiaParcelResponse> {
  const api = await createAsendiaManifestApi();
  const res = await api.get(`/api/parcels/${encodeURIComponent(parcelId)}`);
  return res.data as AsendiaParcelResponse;
}
