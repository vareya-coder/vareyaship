import { logger } from '@/utils/logger';
import { ShipHeroAuthError, ShipHeroNetworkError } from './errors';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export class ShipHeroAuth {
  private accessToken = process.env.SHIPHERO_ACCESS_TOKEN ?? '';
  private tokenExpiryTime: number | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<void> | null = null;

  async getValidToken(): Promise<string> {
    if (!this.accessToken || this.isTokenExpired()) {
      await this.refreshTokens();
    }
    if (this.isRefreshing && this.refreshPromise) {
      await this.refreshPromise;
    }
    if (!this.accessToken) {
      throw new ShipHeroAuthError('ShipHero access token is unavailable');
    }
    return this.accessToken;
  }

  async forceRefresh(): Promise<void> {
    this.accessToken = '';
    this.tokenExpiryTime = null;
    await this.refreshTokens();
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiryTime) return false;
    return Date.now() >= this.tokenExpiryTime - 5 * 60 * 1000;
  }

  async refreshTokens(): Promise<void> {
    if (this.isRefreshing && this.refreshPromise) return this.refreshPromise;
    this.isRefreshing = true;
    this.refreshPromise = this.performRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<void> {
    const refreshToken = process.env.SHIPHERO_REFRESH_TOKEN;
    const authUrl = process.env.SHIPHERO_AUTH_URL ?? 'https://public-api.shiphero.com/auth/token';
    if (!refreshToken) {
      if (this.accessToken) return;
      throw new ShipHeroAuthError('SHIPHERO_REFRESH_TOKEN is required when SHIPHERO_ACCESS_TOKEN is not configured');
    }

    let response: Response;
    try {
      response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (error) {
      throw new ShipHeroNetworkError('ShipHero token refresh network failure', error);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ShipHeroAuthError(`ShipHero token refresh failed: ${response.status} ${response.statusText}`, body);
    }

    const data = (await response.json()) as TokenResponse;
    if (!data.access_token || !data.expires_in) {
      throw new ShipHeroAuthError('Invalid ShipHero token refresh response', data);
    }

    this.accessToken = data.access_token;
    this.tokenExpiryTime = Date.now() + data.expires_in * 1000;
    logger.info('shiphero_token_refreshed', {
      expiresAt: new Date(this.tokenExpiryTime).toISOString(),
    });
  }
}

let authInstance: ShipHeroAuth | null = null;

export function getShipHeroAuth(): ShipHeroAuth {
  if (!authInstance) authInstance = new ShipHeroAuth();
  return authInstance;
}
