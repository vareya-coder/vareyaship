import { NextRequest, NextResponse } from 'next/server';
import {
  getVacierLatamConfig,
  processVacierLatamCustomsBatch,
  validateVacierLatamConfig,
} from '@/modules/vacierLatamCustoms/customs.service';
import { logger } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  if (!authorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const config = getVacierLatamConfig();
  if (!config.enabled) {
    return NextResponse.json({
      message: 'Vacier LATAM customs processing is disabled',
      enabled: config.enabled,
      dryRun: config.dryRun,
    });
  }

  const configErrors = validateVacierLatamConfig(config);
  if (configErrors.length > 0) {
    logger.error('vacier_latam_config_invalid', { errors: configErrors });
    return NextResponse.json({
      message: 'Vacier LATAM customs configuration is invalid',
      errors: configErrors,
    }, { status: 500 });
  }

  try {
    const result = await processVacierLatamCustomsBatch(config);
    return NextResponse.json({
      success: result.status !== 'failed',
      batchId: result.batchId,
      status: result.status,
      ordersQueried: result.ordersQueried,
      ordersProcessed: result.ordersProcessed,
      ordersSkipped: result.ordersSkipped,
      errorsCount: result.errorsCount,
      creditsUsed: result.creditsUsed,
      dryRun: result.dryRun,
      durationMs: Date.now() - startTime,
      errorDetails: result.errorDetails.length > 0 ? result.errorDetails : undefined,
    }, { status: result.status === 'failed' ? 500 : 200 });
  } catch (error) {
    logger.error('vacier_latam_cron_failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
