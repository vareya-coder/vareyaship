import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROXY_FLAG = 'UPLOADTHING_PDF_PROXY_URL_ENABLED';
const STREAMING_FLAG = 'UPLOADTHING_PDF_PROXY_STREAMING_ENABLED';
const FORWARDED_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
  'accept-ranges',
  'content-range',
];

function normalizeFileKey(fileParam: string) {
  if (!fileParam) {
    return null;
  }

  return fileParam.toLowerCase().endsWith('.pdf')
    ? fileParam.slice(0, -4)
    : fileParam;
}

function resolveUploadThingAppId(): string | null {
  const envAppId = process.env.UPLOADTHING_APP_ID?.trim();
  if (envAppId) {
    return envAppId;
  }

  const rawToken = process.env.UPLOADTHING_TOKEN?.trim();
  if (!rawToken) {
    return null;
  }

  // dotenv can preserve surrounding quotes when set manually; strip them defensively.
  const normalizedToken = rawToken.replace(/^['"]|['"]$/g, '');

  try {
    const decodedToken = Buffer.from(normalizedToken, 'base64').toString('utf8');
    const parsedToken = JSON.parse(decodedToken) as { appId?: unknown };
    return typeof parsedToken.appId === 'string' && parsedToken.appId.trim()
      ? parsedToken.appId.trim()
      : null;
  } catch {
    return null;
  }
}

function isEnabled(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes';
}

function isProxyEnabled(): boolean {
  return isEnabled(process.env[PROXY_FLAG]);
}

function shouldStreamThroughProxy(): boolean {
  return isProxyEnabled() && isEnabled(process.env[STREAMING_FLAG]);
}

function resolveUploadThingTargetUrl(fileParam: string): string | NextResponse {
  const fileKey = normalizeFileKey(fileParam);
  const appId = resolveUploadThingAppId();

  if (!appId) {
    return NextResponse.json(
      { message: 'UploadThing appId is not configured. Set UPLOADTHING_TOKEN or UPLOADTHING_APP_ID.' },
      { status: 500 },
    );
  }

  if (!fileKey) {
    return NextResponse.json(
      { message: 'Invalid UploadThing file key.' },
      { status: 400 },
    );
  }

  return `https://${appId}.ufs.sh/f/${encodeURIComponent(fileKey)}`;
}

function buildForwardHeaders(upstream: Response): Headers {
  const headers = new Headers();

  for (const headerName of FORWARDED_HEADERS) {
    const headerValue = upstream.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
}

function redirectToUploadThingFile(fileParam: string) {
  const targetUrl = resolveUploadThingTargetUrl(fileParam);
  if (targetUrl instanceof NextResponse) {
    return targetUrl;
  }

  const response = NextResponse.redirect(targetUrl, 307);
  response.headers.set('x-uploadthing-proxy-mode', 'redirect');
  return response;
}

async function streamUploadThingFile(
  request: NextRequest,
  fileParam: string,
  method: 'GET' | 'HEAD',
) {
  const targetUrl = resolveUploadThingTargetUrl(fileParam);
  if (targetUrl instanceof NextResponse) {
    return targetUrl;
  }

  const upstreamHeaders = new Headers();
  const rangeHeader = request.headers.get('range');
  const acceptHeader = request.headers.get('accept');

  if (rangeHeader) {
    upstreamHeaders.set('range', rangeHeader);
  }
  if (acceptHeader) {
    upstreamHeaders.set('accept', acceptHeader);
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      redirect: 'follow',
      cache: 'no-store',
    });

    const responseHeaders = buildForwardHeaders(upstreamResponse);
    responseHeaders.set('x-uploadthing-proxy-mode', 'stream');

    if (method === 'HEAD') {
      return new NextResponse(null, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { message: 'Failed to fetch file from UploadThing.' },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: { file: string } },
) {
  if (shouldStreamThroughProxy()) {
    return streamUploadThingFile(request, context.params.file, 'GET');
  }

  return redirectToUploadThingFile(context.params.file);
}

export async function HEAD(
  request: NextRequest,
  context: { params: { file: string } },
) {
  if (shouldStreamThroughProxy()) {
    return streamUploadThingFile(request, context.params.file, 'HEAD');
  }

  return redirectToUploadThingFile(context.params.file);
}
