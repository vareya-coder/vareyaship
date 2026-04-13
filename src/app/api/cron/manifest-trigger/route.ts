import { NextRequest, NextResponse } from 'next/server';
import { evaluateBatchesForClosing, closeBatchGuarded } from '@/modules/batching/batch.service';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { getBatchShipments } from '@/modules/batching/batch.repository';
import { manifestBatch } from '@/modules/manifesting/manifest.service';
import { logEvent } from '@/modules/logging/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization');
  return token === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const flags = getFlags();
  const now = new Date();
  const evalRes = await evaluateBatchesForClosing(now);
  const dryRun = !!flags.dry_run_manifest;

  if (evalRes.toCloseIds.length === 0) {
    return NextResponse.json({ message: 'No eligible batches', reason: evalRes.reason, dryRun });
  }

  const results: any[] = [];

  for (const batchId of evalRes.toCloseIds) {
    if (!dryRun) {
      await closeBatchGuarded(batchId);
    }
    const toManifestShipments = await getBatchShipments(batchId);
    const parcelIds = (toManifestShipments as any[]).map((s) => s.parcel_id).filter(Boolean);

    if (dryRun) {
      logEvent({ event: 'manifest_triggered', batch_id: batchId, status: 'dry_run', count: parcelIds.length });
      results.push({ batchId, dryRun: true, wouldManifestCount: parcelIds.length });
      continue;
    }

    const manifestRes = await manifestBatch(batchId, parcelIds);
    results.push({ batchId, manifestRes });
  }

  return NextResponse.json({ message: 'Processed batches', results, reason: evalRes.reason, dryRun });
}

