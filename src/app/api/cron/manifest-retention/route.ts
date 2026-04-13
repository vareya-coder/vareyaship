import { NextRequest, NextResponse } from 'next/server';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { db } from '@/lib/db';
import { manifests } from '@/lib/db/schema';
import { lt } from 'drizzle-orm';
import { utapi } from '@/utils/uploadthingClient';
import { logEvent } from '@/modules/logging/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization');
  return token === `Bearer ${process.env.CRON_SECRET}`;
}

function extractUploadThingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/f\/([^/]+)$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { retention_days } = getFlags();
  const cutoff = new Date(Date.now() - retention_days * 24 * 60 * 60 * 1000);

  const old = await db.select().from(manifests).where(lt(manifests.created_at, cutoff as any));

  let deletedFiles = 0;
  for (const m of old as any[]) {
    const key = extractUploadThingKey(m.document_url);
    if (key) {
      try {
        const res = await utapi.deleteFiles([key]);
        if (res.success) deletedFiles += res.deletedCount ?? 0;
      } catch (e) {
        logEvent({ event: 'manifest_document_delete_failed', manifest_id: m.manifest_id, status: 'error', errorMessage: (e as any)?.message });
      }
    }
  }

  logEvent({ event: 'manifest_retention_cleanup', status: 'completed', count: (old as any[]).length, deletedFiles });
  return NextResponse.json({ message: 'manifest retention executed', examined: (old as any[]).length, deletedFiles });
}

