import { getManifestParcels } from '@/modules/asendia/manifests/getManifestParcels';

export async function verifyManifest(manifestId: string, expectedParcelIds: string[]): Promise<{ matched: boolean; actual: string[] }> {
  const actual = await getManifestParcels(manifestId);
  const expectedSet = new Set(expectedParcelIds);
  const actualSet = new Set(actual);
  if (expectedSet.size !== actualSet.size) return { matched: false, actual };
  for (const id of expectedSet) {
    if (!actualSet.has(id)) return { matched: false, actual };
  }
  return { matched: true, actual };
}

