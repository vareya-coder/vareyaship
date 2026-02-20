import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { utapi } from '@/utils/uploadthingClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE_PATH = '/api/cron/ut-delete-old-files';
const BATCH_SIZE = 500;
const DEFAULT_KEEP_FILES_COUNT = 1500;
const DEFAULT_MAX_BATCHES = 10;

type CleanupReason = 'no_more_files' | 'max_batches_reached';

function logInfo(payload: Record<string, unknown>) {
  logger.log({
    level: 'info',
    message: String(payload.event ?? 'ut_cleanup_info'),
    ...payload,
  });
}

function logWarn(payload: Record<string, unknown>) {
  logger.log({
    level: 'warn',
    message: String(payload.event ?? 'ut_cleanup_warn'),
    ...payload,
  });
}

function logError(payload: Record<string, unknown>) {
  logger.log({
    level: 'error',
    message: String(payload.event ?? 'ut_cleanup_error'),
    ...payload,
  });
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestSource(request: NextRequest): 'vercel-cron' | 'manual' {
  return request.headers.get('x-vercel-cron') ? 'vercel-cron' : 'manual';
}

export async function GET(request: NextRequest) {
  const runId = randomUUID();
  const source = getRequestSource(request);
  const keepFilesCount = parsePositiveInt(
    process.env.UT_KEEP_FILES_COUNT,
    DEFAULT_KEEP_FILES_COUNT,
  );
  const maxBatches = parsePositiveInt(
    process.env.UT_DELETE_MAX_BATCHES,
    DEFAULT_MAX_BATCHES,
  );
  const environment = process.env.NODE_ENV ?? 'development';
  const startedAt = Date.now();

  const baseLogContext = {
    runId,
    route: ROUTE_PATH,
    source,
    keepFilesCount,
    batchSize: BATCH_SIZE,
    maxBatches,
    environment,
  };

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logError({
      event: 'ut_cleanup_config_error',
      ...baseLogContext,
      errorMessage: 'Missing CRON_SECRET environment variable.',
      errorName: 'MissingConfiguration',
      statusCode: 500,
    });
    // console.error(JSON.stringify({ event: 'ut_cleanup_config_error', ...baseLogContext }));

    return NextResponse.json(
      { message: 'CRON_SECRET is not configured.', runId },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    logWarn({
      event: 'ut_cleanup_auth_failed',
      ...baseLogContext,
      statusCode: 401,
    });
    // console.warn(JSON.stringify({ event: 'ut_cleanup_auth_failed', ...baseLogContext }));

    return NextResponse.json({ message: 'Unauthorized.', runId }, { status: 401 });
  }

  logInfo({
    event: 'ut_cleanup_started',
    ...baseLogContext,
  });
  // console.log(JSON.stringify({ event: 'ut_cleanup_started', ...baseLogContext }));

  let batchesProcessed = 0;
  let filesDeleted = 0;
  let drained = false;
  let reason: CleanupReason = 'no_more_files';

  try {
    for (let batchNumber = 1; batchNumber <= maxBatches; batchNumber += 1) {
      const listFilesResponse = await utapi.listFiles({
        limit: BATCH_SIZE,
        offset: keepFilesCount,
      });
      const files = listFilesResponse.files;
      const listedCount = files.length;

      logInfo({
        event: 'ut_cleanup_batch_fetched',
        ...baseLogContext,
        batchNumber,
        listedCount,
        deletedCount: 0,
        filesDeletedTotal: filesDeleted,
        batchesProcessed,
      });
      // console.log(JSON.stringify({ event: 'ut_cleanup_batch_fetched', ...baseLogContext, batchNumber, listedCount }));

      if (listedCount === 0) {
        drained = true;
        reason = 'no_more_files';
        break;
      }

      const fileKeysToDelete = files.map(({ key }) => key);
      const deleteResult = await utapi.deleteFiles(fileKeysToDelete);

      batchesProcessed += 1;
      filesDeleted += deleteResult.deletedCount;

      logInfo({
        event: 'ut_cleanup_batch_deleted',
        ...baseLogContext,
        batchNumber,
        listedCount,
        deletedCount: deleteResult.deletedCount,
        filesDeletedTotal: filesDeleted,
        batchesProcessed,
      });
      // console.log(JSON.stringify({ event: 'ut_cleanup_batch_deleted', ...baseLogContext, batchNumber, listedCount, deletedCount: deleteResult.deletedCount }));

      if (!deleteResult.success) {
        throw Object.assign(
          new Error('UploadThing deleteFiles returned success=false.'),
          { statusCode: 500 },
        );
      }

      if (batchNumber === maxBatches) {
        drained = false;
        reason = 'max_batches_reached';
      }
    }

    if (reason === 'max_batches_reached') {
      logWarn({
        event: 'ut_cleanup_max_batches_reached',
        ...baseLogContext,
        batchesProcessed,
        filesDeletedTotal: filesDeleted,
      });
      // console.warn(JSON.stringify({ event: 'ut_cleanup_max_batches_reached', ...baseLogContext, batchesProcessed, filesDeletedTotal: filesDeleted }));
    }

    const durationMs = Date.now() - startedAt;
    logInfo({
      event: 'ut_cleanup_completed',
      ...baseLogContext,
      drained,
      reason,
      durationMs,
      batchesProcessed,
      filesDeletedTotal: filesDeleted,
    });
    // console.log(JSON.stringify({ event: 'ut_cleanup_completed', ...baseLogContext, drained, reason, durationMs, batchesProcessed, filesDeletedTotal: filesDeleted }));

    return NextResponse.json(
      {
        message: 'UploadThing cleanup completed.',
        runId,
        drained,
        reason,
        keepFilesCount,
        batchSize: BATCH_SIZE,
        maxBatches,
        filesDeleted,
        batchesProcessed,
        durationMs,
      },
      { status: 200 },
    );
  } catch (error) {
    const typedError = error as {
      message?: string;
      name?: string;
      stack?: string;
      statusCode?: number;
    };

    const errorLogPayload: Record<string, unknown> = {
      event: 'ut_cleanup_failed',
      ...baseLogContext,
      errorMessage:
        typedError.message ?? 'Unknown error while cleaning UploadThing files.',
      errorName: typedError.name ?? 'UnknownError',
      statusCode:
        typeof typedError.statusCode === 'number' ? typedError.statusCode : 500,
    };

    if (environment !== 'production' && typedError.stack) {
      errorLogPayload.stack = typedError.stack;
    }

    logError(errorLogPayload);
    // console.error(JSON.stringify({ event: 'ut_cleanup_failed', ...errorLogPayload }));

    return NextResponse.json(
      {
        message: 'Failed to cleanup old UploadThing files.',
        runId,
        drained: false,
        reason: 'runtime_error',
        filesDeleted,
        batchesProcessed,
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
