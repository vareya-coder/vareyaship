import axios, { AxiosInstance } from 'axios';

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

function createJsonClient(baseURL: string, headers?: Record<string, string>): AxiosInstance {
  return axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
  });
}

export async function authenticateAsendiaSync(): Promise<string> {
  const baseURL = getAsendiaBaseUrl();
  const { username, password } = getAsendiaCredentials();
  const api = createJsonClient(baseURL);
  const res = await api.post('/api/authenticate', { username, password });
  return res.data.id_token as string;
}

export async function createAsendiaManifestApi(): Promise<AxiosInstance> {
  const baseURL = getAsendiaBaseUrl();
  const idToken = await authenticateAsendiaSync();
  return createJsonClient(baseURL, { Authorization: `Bearer ${idToken}` });
}

export function getAsendiaManifestBaseUrl(): string {
  return getAsendiaBaseUrl();
}
