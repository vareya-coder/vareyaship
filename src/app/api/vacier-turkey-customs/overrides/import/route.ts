import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/modules/auth/session';
import { importTurkeyOverridesFromCsv } from '@/modules/vacierTurkeyCustoms/overrides.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const contentType = req.headers.get('content-type') ?? '';
    let csv = '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      csv = file instanceof File ? await file.text() : String(form.get('csv') ?? '');
    } else {
      const body = await req.json().catch(() => null);
      csv = String(body?.csv ?? '');
    }

    if (!csv.trim()) {
      return NextResponse.json({ message: 'CSV content is required' }, { status: 400 });
    }

    return NextResponse.json(await importTurkeyOverridesFromCsv(csv));
  } catch (error: any) {
    return NextResponse.json({ message: error?.message ?? 'Failed to import Turkey overrides' }, { status: 400 });
  }
}
