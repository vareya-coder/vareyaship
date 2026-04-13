import axios from 'axios';

async function authenticate(): Promise<string> {
  const username = process.env.ASENDIA_SYNC_USERNAME as string;
  const password = process.env.ASENDIA_SYNC_PASSWORD as string;
  const baseURL = process.env.ASENDIA_API_BASE_URL as string;
  if (!username || !password || !baseURL) {
    throw new Error('Asendia REST auth config missing');
  }
  const api = axios.create({ baseURL, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
  const res = await api.post('/api/authenticate', { username, password });
  return res.data.id_token as string;
}

export async function getManifestDocument(manifestId: string): Promise<Buffer> {
  const baseURL = process.env.ASENDIA_API_BASE_URL as string;
  const idToken = await authenticate();
  const api = axios.create({ baseURL, responseType: 'arraybuffer', headers: { Authorization: `Bearer ${idToken}` } });
  const res = await api.get(`/api/manifests/${encodeURIComponent(manifestId)}/document`);
  return Buffer.from(res.data);
}

