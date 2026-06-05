import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  vacierLatamCustomsCursor,
  vacierLatamCustomsOrderResults,
  vacierLatamCustomsRuns,
} from '@/lib/db/schema';
import { logger } from '@/utils/logger';
import type { VacierLatamBatchResult, VacierLatamOrderResult } from './customs.types';

const DEFAULT_CURSOR_NAME = 'main';

export async function createRun(result: VacierLatamBatchResult): Promise<void> {
  await db.insert(vacierLatamCustomsRuns).values({
    batchId: result.batchId,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    ordersQueried: result.ordersQueried,
    ordersProcessed: result.ordersProcessed,
    ordersSkipped: result.ordersSkipped,
    errorsCount: result.errorsCount,
    errorDetails: result.errorDetails,
    creditsUsed: result.creditsUsed,
    dryRun: result.dryRun,
    status: result.status,
  });
}

export async function updateRun(result: VacierLatamBatchResult): Promise<void> {
  await db
    .update(vacierLatamCustomsRuns)
    .set({
      completedAt: result.completedAt,
      ordersQueried: result.ordersQueried,
      ordersProcessed: result.ordersProcessed,
      ordersSkipped: result.ordersSkipped,
      errorsCount: result.errorsCount,
      errorDetails: result.errorDetails.length > 0 ? result.errorDetails : null,
      creditsUsed: result.creditsUsed,
      dryRun: result.dryRun,
      status: result.status,
    })
    .where(eq(vacierLatamCustomsRuns.batchId, result.batchId));
}

function mapOrderResultForInsert(batchId: string, result: VacierLatamOrderResult) {
  return {
    batchId,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    destinationCountry: result.destinationCountry ?? null,
    orderDate: result.orderDate ? new Date(result.orderDate) : null,
    status: result.status,
    reason: result.reason ?? null,
    copiedCustomsTotal: result.copiedCustomsTotal ?? null,
    aboveReferenceValue: result.aboveReferenceValue ?? false,
    lineItemCount: result.lineItemCount ?? 0,
    errorMessage: result.error?.message ?? null,
  };
}

export async function insertOrderResult(batchId: string, result: VacierLatamOrderResult): Promise<void> {
  await db.insert(vacierLatamCustomsOrderResults).values(mapOrderResultForInsert(batchId, result));
}

export async function insertOrderResults(batchId: string, results: VacierLatamOrderResult[]): Promise<void> {
  if (results.length === 0) return;
  await db.insert(vacierLatamCustomsOrderResults).values(
    results.map((result) => mapOrderResultForInsert(batchId, result)),
  );
}

export async function getProcessingCursor(
  processingStartDate: string,
  cursorName = DEFAULT_CURSOR_NAME,
): Promise<Date> {
  const [cursor] = await db
    .select()
    .from(vacierLatamCustomsCursor)
    .where(eq(vacierLatamCustomsCursor.cursorName, cursorName))
    .limit(1);

  if (cursor) {
    return cursor.lastProcessedDate;
  }

  const startDate = new Date(processingStartDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Invalid VACIER_LATAM_PROCESSING_START_DATE: ${processingStartDate}`);
  }

  await db.insert(vacierLatamCustomsCursor).values({
    cursorName,
    lastProcessedDate: startDate,
    updatedAt: new Date(),
    updatedByBatchId: null,
  });

  return startDate;
}

export async function updateProcessingCursor(
  newDate: Date,
  batchId: string,
  cursorName = DEFAULT_CURSOR_NAME,
): Promise<void> {
  const updated = await db
    .update(vacierLatamCustomsCursor)
    .set({
      lastProcessedDate: newDate,
      updatedAt: new Date(),
      updatedByBatchId: batchId,
    })
    .where(eq(vacierLatamCustomsCursor.cursorName, cursorName))
    .returning({ id: vacierLatamCustomsCursor.id });

  if (updated.length === 0) {
    await db.insert(vacierLatamCustomsCursor).values({
      cursorName,
      lastProcessedDate: newDate,
      updatedAt: new Date(),
      updatedByBatchId: batchId,
    });
  }
}

export function getLatestOrderDate(orders: Array<{ order_date: string }>): Date {
  const dates = orders
    .map((order) => new Date(order.order_date))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (dates.length === 0) return new Date();

  const latest = new Date(Math.max(...dates.map((date) => date.getTime())));
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (latest > oneDayFromNow) {
    logger.warn('vacier_latam_cursor_future_date_capped', {
      latestOrderDate: latest.toISOString(),
      cappedTo: now.toISOString(),
    });
    return now;
  }

  return latest;
}

export async function hasRecentRunningRun(staleMinutes: number): Promise<boolean> {
  const [latest] = await db
    .select()
    .from(vacierLatamCustomsRuns)
    .orderBy(desc(vacierLatamCustomsRuns.startedAt))
    .limit(1);

  if (!latest || latest.status !== 'running') return false;
  const startedAt = latest.startedAt;
  if (!startedAt) return false;
  return Date.now() - startedAt.getTime() < staleMinutes * 60_000;
}
