import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

const TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured')
  }
  return secret
}

export function createToken(userId: string): string {
  return jwt.sign({ userId }, getSecret(), { expiresIn: TOKEN_MAX_AGE_SECONDS })
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, getSecret()) as { userId: string }
  } catch {
    return null
  }
}

export function requireAuth(req: NextRequest): Response | null {
  const token = req.cookies.get('token')?.value
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
