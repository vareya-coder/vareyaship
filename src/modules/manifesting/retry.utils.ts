export const MAX_MANIFEST_PDF_RETRIES = 2; // 1 initial try + 2 retries = 3 total attempts

/**
 * Computes the next retry time for manifest PDF fetching.
 * We space retries by 8 minutes so they are guaranteed to be picked up
 * by the next 10-minute interval cron job without off-by-one second misses.
 */
export function computeManifestRetryDelay(currentRetryCount: number): Date {
  return new Date(Date.now() + 8 * 60 * 1000);
}
