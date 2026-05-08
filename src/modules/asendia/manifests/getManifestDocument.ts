import axios from 'axios';
import { authenticateAsendiaSync, getAsendiaManifestBaseUrl, getAsendiaRequestTimeoutMs } from './client';

export async function getManifestDocument(manifestId: string): Promise<Buffer> {
  const baseURL = getAsendiaManifestBaseUrl();
  const idToken = await authenticateAsendiaSync();

  const sleep = (ms: number) => 
    new Promise((resolve) => setTimeout(resolve, ms));

  const maxAttempts = 2;

  const documentUrl = `/api/manifests/${encodeURIComponent(manifestId)}/document`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const api = axios.create({
      baseURL,
      timeout: getAsendiaRequestTimeoutMs(),
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/pdf' },
    });
    
    const res = await api.get(documentUrl);
    
    const contentType = res.headers['content-type'];

    console.log({
      manifestId,
      attempt,
      status: res.status,
      contentType,
      url: documentUrl,
    });

    // SUCCESS
    if (
      res.status === 200 &&
      contentType?.includes('pdf')
    ) {
      return Buffer.from(res.data);
    }

    // DEBUG BODY
    let errorBody = '';

    try {
      errorBody = Buffer.from(res.data).toString('utf8');
    } catch {
      errorBody = '[unable to decode response body]';
    }

    console.error({
      manifestId,
      attempt,
      status: res.status,
      contentType,
      body: errorBody,
    });

    // if 404 and first attempt -> wait 5 sec then retry
    if (res.status === 404 && attempt < maxAttempts) {
      console.log(
        `Manifest PDF not ready yet for ${manifestId}, waiting 5 seconds before retry...`
      );

      await sleep(5000);

      continue;
    }

    // all other failures OR second 404
    throw new Error(
      `Manifest PDF download failed. status=${res.status}`
    );
  }

  throw new Error('Unexpected manifest PDF retry flow failure');
}
