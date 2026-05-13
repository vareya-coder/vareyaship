import { NextResponse } from 'next/server'

export async function DELETE() {
  const response = new NextResponse("ok")
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
