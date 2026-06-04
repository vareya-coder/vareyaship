import { logger } from '@/utils/logger';

const MAX_CREDITS = 4004;
const REPLENISH_RATE = 60;
const MIN_CREDITS_BUFFER = 100;
const MAX_REQUESTS_PER_WINDOW = 7000;
const REQUEST_WINDOW_MS = 5 * 60 * 1000;
const MIN_REQUESTS_BUFFER = 100;

export class QuotaManager {
  private remainingCredits = MAX_CREDITS;
  private lastUpdateTime = Date.now();
  private totalCreditsUsed = 0;
  private requestTimestamps: number[] = [];

  trackRequest(): void {
    const now = Date.now();
    const windowStart = now - REQUEST_WINDOW_MS;
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => timestamp > windowStart);
    this.requestTimestamps.push(now);
  }

  private getRequestsInWindow(): number {
    const windowStart = Date.now() - REQUEST_WINDOW_MS;
    return this.requestTimestamps.filter((timestamp) => timestamp > windowStart).length;
  }

  canMakeRequest(): { ok: boolean; waitMs?: number; reason?: string } {
    const requestsInWindow = this.getRequestsInWindow();
    if (MAX_REQUESTS_PER_WINDOW - requestsInWindow > MIN_REQUESTS_BUFFER) return { ok: true };
    const oldestRequest = this.requestTimestamps[0];
    return oldestRequest
      ? { ok: false, waitMs: Math.max(0, oldestRequest + REQUEST_WINDOW_MS - Date.now()), reason: 'request_limit' }
      : { ok: true };
  }

  updateFromResponse(complexity: number, remaining?: number): void {
    const now = Date.now();
    if (remaining !== undefined) {
      this.remainingCredits = remaining;
    } else {
      const replenished = Math.floor(((now - this.lastUpdateTime) / 1000) * REPLENISH_RATE);
      this.remainingCredits = Math.min(MAX_CREDITS, this.remainingCredits - complexity + replenished);
    }
    this.totalCreditsUsed += complexity;
    this.lastUpdateTime = now;
  }

  canProceed(estimatedCost: number): { ok: boolean; waitMs?: number; reason?: string } {
    const requestCheck = this.canMakeRequest();
    if (!requestCheck.ok) return requestCheck;
    const replenished = Math.floor(((Date.now() - this.lastUpdateTime) / 1000) * REPLENISH_RATE);
    const currentCredits = Math.min(MAX_CREDITS, this.remainingCredits + replenished);
    const requiredCredits = estimatedCost + MIN_CREDITS_BUFFER;
    if (currentCredits >= requiredCredits) return { ok: true };
    return {
      ok: false,
      waitMs: Math.ceil((requiredCredits - currentCredits) / REPLENISH_RATE) * 1000,
      reason: 'insufficient_credits',
    };
  }

  async waitForCredits(estimatedCost: number, maxWaitMs = 120000): Promise<boolean> {
    const check = this.canProceed(estimatedCost);
    if (check.ok) return true;
    if (!check.waitMs || check.waitMs > maxWaitMs) return false;
    logger.warn('shiphero_quota_wait', { waitMs: check.waitMs, reason: check.reason });
    await new Promise((resolve) => setTimeout(resolve, check.waitMs));
    this.updateFromResponse(0);
    return true;
  }

  getStatus() {
    return {
      remaining: this.remainingCredits,
      totalUsed: this.totalCreditsUsed,
      replenishRate: REPLENISH_RATE,
      maxCredits: MAX_CREDITS,
      requestsInWindow: this.getRequestsInWindow(),
      maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
      requestLimitRemaining: MAX_REQUESTS_PER_WINDOW - this.getRequestsInWindow(),
    };
  }

  reset(): void {
    this.remainingCredits = MAX_CREDITS;
    this.lastUpdateTime = Date.now();
    this.totalCreditsUsed = 0;
    this.requestTimestamps = [];
  }
}

let quotaManagerInstance: QuotaManager | null = null;

export function getQuotaManager(): QuotaManager {
  if (!quotaManagerInstance) quotaManagerInstance = new QuotaManager();
  return quotaManagerInstance;
}

export function resetQuotaManager(): void {
  getQuotaManager().reset();
}
