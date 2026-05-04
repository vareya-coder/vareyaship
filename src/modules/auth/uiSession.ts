import { NextRequest, NextResponse } from 'next/server';

export function hasUiSession(req: NextRequest): boolean {
  return !!req.cookies.get('token')?.value;
}

export function unauthorizedResponse() {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}

