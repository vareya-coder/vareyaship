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

export async function getManifestParcels(manifestId: string): Promise<string[]> {
  const baseURL = process.env.ASENDIA_API_BASE_URL as string;
  const idToken = await authenticate();
  const api = axios.create({ baseURL, headers: { Accept: 'application/json', Authorization: `Bearer ${idToken}` } });
  const res = await api.get(`/api/manifests/${encodeURIComponent(manifestId)}/parcels`);
  const list: string[] = Array.isArray(res.data) ? res.data : (res.data?.parcelIds ?? []);
  return list;
}

