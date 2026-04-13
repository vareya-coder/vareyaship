import { getManifestDocument } from '@/modules/asendia/manifests/getManifestDocument';
import { uploadPdfBuffer } from '@/app/utils/labelPdfUploader';

export async function fetchAndStoreManifestDocument(manifestId: string): Promise<string | undefined> {
  const pdf = await getManifestDocument(manifestId);
  const fileUrl = await uploadPdfBuffer(pdf, `manifest-${manifestId}`);
  return fileUrl;
}

