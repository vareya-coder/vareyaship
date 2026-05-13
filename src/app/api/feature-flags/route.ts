import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/modules/auth/session';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { logError } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    return NextResponse.json({
      flags: getFlags(),
      refreshedAt: new Date().toISOString(),
      source: 'environment',
      editable: false,
    });
  } catch (error: any) {
    logError('feature_flags_api_failed', {
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ message: 'Failed to load feature flags' }, { status: 500 });
  }
}
