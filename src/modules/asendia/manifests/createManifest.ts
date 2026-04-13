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

export async function createManifest(parcelIds: string[]): Promise<{ manifestId: string; errorParcelIds: string[] }> {
  const baseURL = process.env.ASENDIA_API_BASE_URL as string;
  const idToken = await authenticate();
  const api = axios.create({ baseURL, headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${idToken}` } });

  const res = await api.post('/api/manifests', parcelIds);
  const manifestId = res.data.id as string;
  const errorParcelIds: string[] = Array.isArray(res.data.errorParcelIds) ? res.data.errorParcelIds : [];
  return { manifestId, errorParcelIds };
}

