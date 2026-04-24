import axios from 'axios';
import { authenticateAsendiaSync, getAsendiaManifestBaseUrl } from './client';

export async function getManifestDocument(manifestId: string): Promise<Buffer> {
  const baseURL = getAsendiaManifestBaseUrl();
  const idToken = await authenticateAsendiaSync();
  const api = axios.create({ baseURL, responseType: 'arraybuffer', headers: { Authorization: `Bearer ${idToken}` } });
  const res = await api.get(`/api/manifests/${encodeURIComponent(manifestId)}/document`);
  return Buffer.from(res.data);
}
