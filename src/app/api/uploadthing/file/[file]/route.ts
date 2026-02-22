import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function redirectToUploadThingFile(fileParam: string) {
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

  const targetUrl = `https://${appId}.ufs.sh/f/${encodeURIComponent(fileKey)}`;
  return NextResponse.redirect(targetUrl, 307);
}

export async function GET(
  _request: NextRequest,
  context: { params: { file: string } },
) {
  return redirectToUploadThingFile(context.params.file);
}

export async function HEAD(
  _request: NextRequest,
  context: { params: { file: string } },
) {
  return redirectToUploadThingFile(context.params.file);
}
