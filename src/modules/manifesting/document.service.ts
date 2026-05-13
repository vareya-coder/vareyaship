import axios from 'axios';
import { db } from '@/lib/db';
import { manifests } from '@/lib/db/schema';
import { eq, and, lte, asc, gte, or, isNull, inArray, lt, sql } from 'drizzle-orm';
import { getAsendiaManifestBaseUrl, getAsendiaRequestTimeoutMs, authenticateAsendiaSync } from '@/modules/asendia/manifests/client';
import { uploadPdfBuffer } from '@/app/utils/labelPdfUploader';
import { logError, logInfo } from '@/utils/logger';
import { logEvent } from '@/modules/logging/events';
import { computeManifestRetryDelay, MAX_MANIFEST_PDF_RETRIES } from './retry.utils';
import { parseTimeOfDay } from '@/modules/time/time';

type PendingManifestPdfOptions = {
    now?: Date;
    cutoffTime: string;
    timeZone: string;
};

export type ManifestPdfProcessingItem = {
    manifestId: string;
    batchId: number | null;
    success: boolean;
    documentUrl?: string;
    retryable?: boolean;
    failureReason?: string;
};

function buildManifestDocumentTimestamp(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  const second = parts.find((p) => p.type === 'second')?.value;

  return `${year}${month}${day}-${hour}${minute}${second}-AMS`;
}

function addDaysToISODate(dateISO: string, days: number): string {
    const [year, month, day] = dateISO.split('-').map((part) => Number.parseInt(part, 10));
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
}

function getLocalDateTimeParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
    const rawHour = Number(part('hour'));

    return {
        year: Number(part('year')),
        month: Number(part('month')),
        day: Number(part('day')),
        hour: rawHour === 24 ? 0 : rawHour,
        minute: Number(part('minute')),
        second: Number(part('second')),
    };
}

function localDateTimeToUtc(dateISO: string, timeHHmm: string, timeZone: string): Date {
    const [year, month, day] = dateISO.split('-').map((part) => Number.parseInt(part, 10));
    const { hour, minute } = parseTimeOfDay(timeHHmm);
    const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let candidate = new Date(desiredUtcMs);

    for (let i = 0; i < 3; i += 1) {
        const actual = getLocalDateTimeParts(candidate, timeZone);
        const actualUtcMs = Date.UTC(
            actual.year,
            actual.month - 1,
            actual.day,
            actual.hour,
            actual.minute,
            actual.second,
            0,
        );
        const deltaMs = desiredUtcMs - actualUtcMs;
        if (deltaMs === 0) break;
        candidate = new Date(candidate.getTime() + deltaMs);
    }

    return candidate;
}

export async function fetchManifestPdf(manifestId: string) {
    const baseURL = getAsendiaManifestBaseUrl();
    const idToken = await authenticateAsendiaSync();
    const documentUrl = `/api/manifests/${encodeURIComponent(manifestId)}/document`;

    const api = axios.create({
        baseURL,
        timeout: getAsendiaRequestTimeoutMs(),
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/pdf' },
        validateStatus: () => true, // Resolve on all statuses
    });

    const res = await api.get(documentUrl);
    const contentType = res.headers['content-type'];
    
    if (res.status === 200 && contentType?.includes('pdf')) {
        return { success: true as const, status: 200, pdfBuffer: Buffer.from(res.data) };
    }

    let errorBody = '';
    try {
        errorBody = Buffer.from(res.data).toString('utf8');
    } catch {
        errorBody = '[unable to decode response body]';
    }

    return { success: false as const, status: res.status, errorBody, contentType };
}

export async function processSingleManifestPdf(manifestId: string, currentRetryCount: number, cronRunId?: string) {
    logInfo('Processing manifest PDF', { manifest_id: manifestId, retryCount: currentRetryCount, cronRunId, timestamp: new Date().toISOString() });
    logEvent({ event: 'manifest_pdf_fetch_attempt', manifest_id: manifestId, status: 'attempt', cronRunId });

    const fetchResult = await fetchManifestPdf(manifestId);

    if (fetchResult.success) {
        const timestamp = buildManifestDocumentTimestamp(new Date());
        const documentUrl = await uploadPdfBuffer(fetchResult.pdfBuffer, `manifest-${timestamp}-${manifestId}`);
        
        await db.update(manifests).set({
            status: 'UPLOADED',
            document_url: documentUrl,
            pdf_ready_at: new Date(),
            pdf_last_attempt_at: new Date(),
            pdf_failure_reason: null as any,
        }).where(eq(manifests.manifest_id, manifestId));

        logInfo('Manifest PDF successfully uploaded', { manifest_id: manifestId, documentUrl, cronRunId, timestamp: new Date().toISOString() });
        logEvent({ event: 'manifest_success', manifest_id: manifestId, status: 'UPLOADED', cronRunId });
        return { success: true, documentUrl };
    }

    // Failure case
    const is404 = fetchResult.status === 404;
    const isFinalAttempt = currentRetryCount >= MAX_MANIFEST_PDF_RETRIES;

    if (is404 && !isFinalAttempt) {
        // Retryable temporary failure
        const nextRetryCount = currentRetryCount + 1;
        const nextRetryAt = computeManifestRetryDelay(nextRetryCount);

        await db.update(manifests).set({
            status: 'PDF_PENDING',
            pdf_retry_count: nextRetryCount,
            pdf_last_attempt_at: new Date(),
            pdf_next_retry_at: nextRetryAt,
            pdf_failure_reason: `HTTP 404: PDF not ready`,
        }).where(eq(manifests.manifest_id, manifestId));

        logInfo('Manifest PDF not ready, scheduling retry', { manifest_id: manifestId, nextRetryCount, nextRetryAt: nextRetryAt.toISOString(), cronRunId, timestamp: new Date().toISOString() });
        logEvent({ event: 'manifest_pdf_retry', manifest_id: manifestId, status: 'PDF_PENDING', cronRunId });
        return { success: false, retryable: true };
    }

    // Terminal failure (5xx, 403, 401, or exhausted retries)
    const failureReason = `HTTP ${fetchResult.status}: ${fetchResult.errorBody}`;
    await db.update(manifests).set({
        status: 'FAILED',
        pdf_retry_count: currentRetryCount + 1,
        pdf_last_attempt_at: new Date(),
        pdf_failure_reason: failureReason,
    }).where(eq(manifests.manifest_id, manifestId));

    logError('Manifest PDF fetching failed permanently', { manifest_id: manifestId, failureReason, currentRetryCount, cronRunId, timestamp: new Date().toISOString() });
    logEvent({ event: 'manifest_failed', manifest_id: manifestId, status: 'FAILED', errorMessage: failureReason, cronRunId });
    
    return { success: false, retryable: false, failureReason };
}

export async function processPendingManifestPdfs(
    operationalDateISO: string,
    options: PendingManifestPdfOptions,
    cronRunId?: string,
): Promise<{ processed: ManifestPdfProcessingItem[] }> {
    const now = options.now ?? new Date();
    const windowStart = localDateTimeToUtc(operationalDateISO, options.cutoffTime, options.timeZone);
    const windowEnd = localDateTimeToUtc(addDaysToISODate(operationalDateISO, 1), '00:00', options.timeZone);
    const processed: ManifestPdfProcessingItem[] = [];

    const pending = await db.select()
        .from(manifests)
        .where(and(
            inArray(manifests.status, ['MANIFEST_CREATED', 'PDF_PENDING']),
            isNull(manifests.document_url),
            or(
                eq(manifests.status, 'MANIFEST_CREATED'),
                isNull(manifests.pdf_next_retry_at)
            ),
            gte(manifests.created_at, windowStart),
            lt(manifests.created_at, windowEnd)
        ))
        .orderBy(asc(manifests.pdf_next_retry_at))
        .limit(20); // limit to avoid massive cron execution

    if (pending.length === 0) return { processed };

    logInfo(`Found ${pending.length} pending manifest PDFs to process`, {
        cronRunId,
        operationalDateISO,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        now: now.toISOString(),
        timestamp: new Date().toISOString(),
    });

    for (const manifest of pending) {
        try {
            const result = await processSingleManifestPdf(manifest.manifest_id, manifest.pdf_retry_count || 0, cronRunId);
            processed.push({
                manifestId: manifest.manifest_id,
                batchId: manifest.batch_id ?? null,
                success: result.success,
                documentUrl: result.success ? result.documentUrl : undefined,
                retryable: result.success ? undefined : result.retryable,
                failureReason: result.success ? undefined : result.failureReason,
            });
        } catch (error: any) {
            logError('Unexpected error processing pending manifest PDF', { manifest_id: manifest.manifest_id, error: error?.message, cronRunId, timestamp: new Date().toISOString() });
            processed.push({
                manifestId: manifest.manifest_id,
                batchId: manifest.batch_id ?? null,
                success: false,
                retryable: false,
                failureReason: error?.message ?? 'unknown',
            });
        }
    }

    return { processed };
}

export async function listUploadedManifestsPendingSuccessNotification(
    operationalDateISO: string,
    options: PendingManifestPdfOptions,
) {
    const windowStart = localDateTimeToUtc(operationalDateISO, options.cutoffTime, options.timeZone);
    const windowEnd = localDateTimeToUtc(addDaysToISODate(operationalDateISO, 1), '00:00', options.timeZone);

    return db.select({
        manifestId: manifests.manifest_id,
        batchId: manifests.batch_id,
        documentUrl: manifests.document_url,
        createdAt: manifests.created_at,
    })
        .from(manifests)
        .where(and(
            eq(manifests.status, 'UPLOADED'),
            isNull(manifests.success_notified_at),
            gte(manifests.created_at, windowStart),
            lt(manifests.created_at, windowEnd),
            // Drizzle 0.29 does not need a helper import for this SQL predicate.
            sql`${manifests.document_url} IS NOT NULL`,
        ))
        .orderBy(asc(manifests.created_at), asc(manifests.manifest_id))
        .limit(50);
}

export async function markManifestSuccessNotified(manifestId: string, notifiedAt = new Date()) {
    await db.update(manifests).set({
        success_notified_at: notifiedAt,
    }).where(and(
        eq(manifests.manifest_id, manifestId),
        isNull(manifests.success_notified_at),
    ));
}

export async function fetchAndStoreManifestDocument(manifestId: string): Promise<string | undefined> {
    const fetchResult = await fetchManifestPdf(manifestId);
    if (fetchResult.success) {
        const timestamp = buildManifestDocumentTimestamp(new Date());
        return await uploadPdfBuffer(fetchResult.pdfBuffer, `manifest-${timestamp}-${manifestId}`);
    }
    return undefined;
}
