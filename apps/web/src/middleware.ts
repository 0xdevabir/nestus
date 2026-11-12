import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_EXACT = new Set(['/', '/login', '/register', '/status']);

function isPublic(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/invite/')) return true;
  return false;
}

function isAppRoute(pathname: string) {
  if (isPublic(pathname)) return false;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return false;
  const reserved = new Set(['login', 'register', 'status', 'invite', 'api']);
  return !reserved.has(parts[0]!);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAppRoute(pathname)) return NextResponse.next();

  // nestus_rt is Path=/api/v1/auth; nestus_session is Path=/ for middleware.
  const hasSession = Boolean(
    request.cookies.get('nestus_session')?.value || request.cookies.get('nestus_rt')?.value,
  );
  if (!hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
