import { NextRequest, NextResponse } from 'next/server';
import { hasUiSession, unauthorizedResponse } from '@/modules/auth/uiSession';
import { findBatchById } from '@/modules/batching/batch.repository';
import { closeBatchGuarded } from '@/modules/batching/batch.service';
import { logError } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: { batchId: string } },
) {
  if (!hasUiSession(_req)) {
    return unauthorizedResponse();
  }

  const batchId = Number.parseInt(params.batchId, 10);
  if (!Number.isFinite(batchId)) {
    return NextResponse.json({ message: 'Invalid batch id' }, { status: 400 });
  }

  try {
    const batch = await findBatchById(batchId);
    if (!batch) {
      return NextResponse.json({ message: 'Batch not found' }, { status: 404 });
    }

    if ((batch as any).status !== 'OPEN') {
      return NextResponse.json({
        message: 'Only OPEN batches can be force closed',
        batchId,
        status: (batch as any).status ?? null,
      }, { status: 409 });
    }

    await closeBatchGuarded(batchId);
    const updated = await findBatchById(batchId);

    return NextResponse.json({
      message: 'Batch force closed',
      batchId,
      status: (updated as any)?.status ?? 'CLOSING',
      closedAt: (updated as any)?.closing_at
        ? new Date((updated as any).closing_at).toISOString()
        : null,
    });
  } catch (error: any) {
    logError('batch_force_close_api_failed', {
      batch_id: batchId,
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ message: 'Failed to force close batch' }, { status: 500 });
  }
}
