import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { manifests } from '@/lib/db/schema';
import { hasUiSession, unauthorizedResponse } from '@/modules/auth/uiSession';
import { logError } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function mapManifest(row: any) {
  const expected = row.parcel_count_expected ?? 0;
  const actual = row.parcel_count_actual ?? 0;

  return {
    manifestId: row.manifest_id,
    batchId: row.batch_id ?? null,
    status: row.status ?? null,
    parcelCountExpected: expected,
    parcelCountActual: row.parcel_count_actual ?? null,
    verificationStatus: row.verification_status ?? null,
    documentUrl: row.document_url ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    countDelta: row.parcel_count_actual === null || row.parcel_count_actual === undefined
      ? null
      : expected - actual,
  };
}

export async function GET(req: NextRequest) {
  if (!hasUiSession(req)) {
    return unauthorizedResponse();
  }

  try {
    const limitParam = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    const rows = await db
      .select()
      .from(manifests)
      .orderBy(desc(manifests.created_at), desc(manifests.manifest_id))
      .limit(limit);

    return NextResponse.json({
      refreshedAt: new Date().toISOString(),
      manifests: rows.map(mapManifest),
    });
  } catch (error: any) {
    logError('manifest_viewer_api_failed', {
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ message: 'Failed to load manifests' }, { status: 500 });
  }
}
