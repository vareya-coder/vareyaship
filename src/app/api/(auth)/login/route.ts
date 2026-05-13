import { config } from 'dotenv'
import { NextRequest, NextResponse } from 'next/server'
import { createToken } from '@/modules/auth/session'

config()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    if (email !== adminEmail || password !== adminPassword) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 },
      )
    }

    const token = createToken(email)
    const response = NextResponse.json({ success: true })

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Authentication error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
