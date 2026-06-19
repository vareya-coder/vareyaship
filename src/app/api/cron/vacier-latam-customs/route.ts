import { NextRequest, NextResponse } from 'next/server';
import {
  getConfiguredVacierLatamCountries,
  isVacierLatamCustomsEnabled,
} from '@/modules/vacierLatamCustoms/latamConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  return NextResponse.json({
    message: 'Vacier LATAM ShipHero mutation cron is retired. Customs overrides are applied during carrier label generation.',
    retired: true,
    labelTimeOverridesEnabled: isVacierLatamCustomsEnabled(),
    countries: getConfiguredVacierLatamCountries(),
  });
}
