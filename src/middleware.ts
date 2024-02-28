import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';


export function middleware(request: NextRequest) {
  const token = request.cookies.get('token'); 

  if (!token) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }
  // console.log("Token is valid, proceeding with the request.");
  return NextResponse.next();
}


 
// See "Matching Paths" below to learn more
export const config = {
  matcher: '/',
};
