import axios, { AxiosInstance } from 'axios';
import { getPositiveIntFromEnv } from '@/utils/timeout';

export type AsendiaManifestApi = AxiosInstance;

let cachedAuthToken: { token: string; expiresAtMs: number } | null = null;

function getAsendiaBaseUrl(): string {
  const baseURL = process.env.ASENDIA_API_BASE_URL as string | undefined;
  if (!baseURL) {
    throw new Error('Missing ASENDIA_API_BASE_URL');
  }
  return baseURL;
}

function getAsendiaCredentials(): { username: string; password: string } {
  const username = process.env.ASENDIA_SYNC_USERNAME as string | undefined;
  const password = process.env.ASENDIA_SYNC_PASSWORD as string | undefined;
  if (!username || !password) {
    throw new Error('Missing ASENDIA_SYNC_USERNAME or ASENDIA_SYNC_PASSWORD');
  }
  return { username, password };
}

export function getAsendiaRequestTimeoutMs(): number {
  return getPositiveIntFromEnv(process.env.ASENDIA_API_TIMEOUT_MS, 30000);
}

function getAsendiaAuthCacheMs(): number {
  return getPositiveIntFromEnv(process.env.ASENDIA_AUTH_CACHE_MS, 5 * 60 * 1000);
}

function createJsonClient(baseURL: string, headers?: Record<string, string>): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: getAsendiaRequestTimeoutMs(),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
  });
}

export async function authenticateAsendiaSync(): Promise<string> {
  if (cachedAuthToken && cachedAuthToken.expiresAtMs > Date.now()) {
    return cachedAuthToken.token;
  }

  const baseURL = getAsendiaBaseUrl();
  const { username, password } = getAsendiaCredentials();
  const api = createJsonClient(baseURL);
  const res = await api.post('/api/authenticate', { username, password });
  const token = res.data.id_token as string;
  cachedAuthToken = {
    token,
    expiresAtMs: Date.now() + getAsendiaAuthCacheMs(),
  };
  return token;
}

export async function createAsendiaManifestApi(): Promise<AsendiaManifestApi> {
  const baseURL = getAsendiaBaseUrl();
  const idToken = await authenticateAsendiaSync();
  return createJsonClient(baseURL, { Authorization: `Bearer ${idToken}` });
}

export function getAsendiaManifestBaseUrl(): string {
  return getAsendiaBaseUrl();
}
