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

function redirectToUploadThingFile(fileParam: string) {
  const fileKey = normalizeFileKey(fileParam);
  const appId = process.env.UPLOADTHING_APP_ID;

  if (!appId) {
    return NextResponse.json(
      { message: 'UPLOADTHING_APP_ID is not configured.' },
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
