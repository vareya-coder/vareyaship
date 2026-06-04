export class ShipHeroError extends Error {
  constructor(
    message: string,
    public code = 'SHIPHERO_ERROR',
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ShipHeroError';
  }
}

export class ShipHeroAuthError extends ShipHeroError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTH_ERROR', undefined, details);
    this.name = 'ShipHeroAuthError';
  }
}

export class ShipHeroQuotaError extends ShipHeroError {
  constructor(message: string, details?: unknown, public retryAfterMs?: number) {
    super(message, 'QUOTA_ERROR', 429, details);
    this.name = 'ShipHeroQuotaError';
  }
}

export class ShipHeroGraphQLError extends ShipHeroError {
  constructor(message: string, public graphqlErrors: unknown[]) {
    super(message, 'GRAPHQL_ERROR', undefined, graphqlErrors);
    this.name = 'ShipHeroGraphQLError';
  }
}

export class ShipHeroNetworkError extends ShipHeroError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', undefined, details);
    this.name = 'ShipHeroNetworkError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ShipHeroNetworkError) return true;
  if (error instanceof ShipHeroError && error.status && error.status >= 500) return true;
  return false;
}
