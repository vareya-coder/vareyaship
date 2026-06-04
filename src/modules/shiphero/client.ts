import { logger } from '@/utils/logger';
import { getShipHeroAuth } from './auth';
import { getQuotaManager } from './quota';
import {
  ShipHeroAuthError,
  ShipHeroError,
  ShipHeroGraphQLError,
  ShipHeroNetworkError,
  ShipHeroQuotaError,
  isRetryableError,
} from './errors';

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>;
  extensions?: {
    request_id?: string;
    complexity?: number;
    credits?: { used?: number; remaining?: number };
  };
}

interface RequestOptions {
  maxRetries?: number;
  retryDelay?: number;
}

export class ShipHeroClient {
  private auth = getShipHeroAuth();
  private quotaManager = getQuotaManager();
  private requestCount = 0;

  async request<T = unknown>(query: string, variables?: Record<string, unknown>, options: RequestOptions = {}): Promise<GraphQLResponse<T>> {
    const { maxRetries = 3, retryDelay = 1000 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(query, variables);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof ShipHeroAuthError || error instanceof ShipHeroGraphQLError || error instanceof ShipHeroQuotaError) {
          throw error;
        }
        if (isRetryableError(error) && attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt);
          logger.warn('shiphero_request_retry', { attempt: attempt + 1, delay, error: lastError.message });
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new ShipHeroError('ShipHero request failed');
  }

  private async executeRequest<T>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    this.requestCount += 1;
    this.quotaManager.trackRequest();
    const token = await this.auth.getValidToken();
    const apiUrl = process.env.SHIPHERO_API_URL ?? 'https://public-api.shiphero.com/graphql';

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      });
    } catch (error) {
      throw new ShipHeroNetworkError('ShipHero GraphQL network failure', error);
    }

    if (response.status === 401) {
      await this.auth.forceRefresh();
      throw new ShipHeroAuthError('ShipHero authentication failed; token refreshed for retry');
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new ShipHeroQuotaError('ShipHero rate limit exceeded', undefined, retryAfter ? Number(retryAfter) * 1000 : undefined);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ShipHeroError(`ShipHero HTTP ${response.status}: ${response.statusText}`, 'HTTP_ERROR', response.status, body);
    }

    const data = (await response.json()) as GraphQLResponse<T>;
    const complexity = data.extensions?.complexity ?? data.extensions?.credits?.used ?? 0;
    this.quotaManager.updateFromResponse(complexity, data.extensions?.credits?.remaining);

    if (data.errors?.length) {
      throw new ShipHeroGraphQLError(
        `ShipHero GraphQL errors: ${data.errors.map((error) => error.message).join(', ')}`,
        data.errors,
      );
    }

    return data;
  }
}

let clientInstance: ShipHeroClient | null = null;

export function getShipHeroClient(): ShipHeroClient {
  if (!clientInstance) clientInstance = new ShipHeroClient();
  return clientInstance;
}
