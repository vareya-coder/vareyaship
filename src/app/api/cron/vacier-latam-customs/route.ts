import { NextRequest, NextResponse } from 'next/server';
import {
  getVacierLatamConfig,
  processVacierLatamCustomsBatch,
  validateVacierLatamConfig,
} from '@/modules/vacierLatamCustoms/customs.service';
import { logger } from '@/utils/logger';
import { isWithinLocalTimeRange } from '@/modules/time/time';

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
  const startTime = Date.now();

  const authError = authorizeCron(req);
  if (authError) return authError;

  const config = getVacierLatamConfig();
  if (!config.enabled) {
    return NextResponse.json({
      message: 'Vacier LATAM customs processing is disabled',
      enabled: config.enabled,
      dryRun: config.dryRun,
    });
  }

  if (!isWithinLocalTimeRange(new Date(), config.runWindowStart, config.runWindowEnd, config.runWindowTimezone)) {
    return NextResponse.json({
      message: 'Vacier LATAM customs cron skipped outside processing window',
      enabled: config.enabled,
      dryRun: config.dryRun,
      runWindowStart: config.runWindowStart,
      runWindowEnd: config.runWindowEnd,
      runWindowTimezone: config.runWindowTimezone,
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
