import { getManifestDocument } from '@/modules/asendia/manifests/getManifestDocument';
import { uploadPdfBuffer } from '@/app/utils/labelPdfUploader';

function buildManifestDocumentTimestamp(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  const second = parts.find((p) => p.type === 'second')?.value;

  return `${year}${month}${day}-${hour}${minute}${second}-AMS`;
}

export async function fetchAndStoreManifestDocument(manifestId: string): Promise<string | undefined> {
  const pdf = await getManifestDocument(manifestId);
  const timestamp = buildManifestDocumentTimestamp(new Date());
  const fileUrl = await uploadPdfBuffer(pdf, `manifest-${timestamp}-${manifestId}`);
  return fileUrl;
}
