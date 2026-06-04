import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/modules/auth/session';
import {
  deactivateOverride,
  editOverride,
  listOverrides,
  saveOverride,
} from '@/modules/vacierLatamCustoms/overrides.service';
import { logError } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseActive(value: string | null): boolean | null {
  if (value === null || value === '' || value === 'all') return null;
  return value === 'true' || value === '1' || value === 'active';
}

function parseId(value: unknown): number {
  const id = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Valid override id is required');
  return id;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const overrides = await listOverrides({
      sku: req.nextUrl.searchParams.get('sku'),
      countryCode: req.nextUrl.searchParams.get('country'),
      isActive: parseActive(req.nextUrl.searchParams.get('active')),
      limit: Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10),
    });

    return NextResponse.json({ overrides, refreshedAt: new Date().toISOString() });
  } catch (error: any) {
    logError('vacier_latam_overrides_list_failed', { error: error?.message ?? String(error) });
    return NextResponse.json({ message: 'Failed to list LATAM overrides' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const override = await saveOverride({ ...body, source: body.source ?? 'manual_ui' });
    return NextResponse.json({ override }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message ?? 'Failed to create LATAM override' }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const override = await editOverride(parseId(body.id), body);
    return NextResponse.json({ override });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message ?? 'Failed to update LATAM override' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    if (body.action === 'deactivate') {
      const override = await deactivateOverride(parseId(body.id), body.updatedBy ?? 'manual_ui');
      return NextResponse.json({ override });
    }

    const override = await editOverride(parseId(body.id), body);
    return NextResponse.json({ override });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message ?? 'Failed to change LATAM override' }, { status: 400 });
  }
}
