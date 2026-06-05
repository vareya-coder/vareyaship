import { NextRequest, NextResponse } from 'next/server';
import { flushBufferedAsendiaShipmentsForDate } from '@/modules/shipments/shipment.service';
import { getOperationalDateISO, AMSTERDAM_TIME_ZONE } from '@/modules/time/time';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = authorizeCron(req);
  if (authError) return authError;

  const operationalDate = req.nextUrl.searchParams.get('date')
    ?? getOperationalDateISO(new Date(), AMSTERDAM_TIME_ZONE);
  const result = await flushBufferedAsendiaShipmentsForDate(operationalDate);

  return NextResponse.json({
    message: result.failed > 0
      ? 'Shipment buffer flush completed with failures'
      : 'Shipment buffer flush completed',
    result,
  }, { status: result.failed > 0 ? 500 : 200 });
}
