import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: cheap cookie-presence gate in front of the authenticated shell.
 * Real authorization happens in the API (JWT guard); this only avoids flashing the
 * dashboard to anonymous visitors and bounces signed-in users away from auth pages.
 *
 * Cookie names mirror COOKIE_NAMES in @acsp/shared (kept inline so the Edge bundle
 * does not pull zod in through the shared package barrel).
 */
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/projects',
  '/websites',
  '/content',
  '/calendar',
  '/analytics',
  '/reports',
  '/settings',
  '/admin',
];

const AUTH_ROUTES = ['/login', '/register'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The access token expires every 15 minutes. If it is gone but a refresh token is
  // still present, let the request through — the api-client refreshes on the first 401.
  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);
  const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  const hasSession = hasAccess || hasRefresh;

  if (matchesPrefix(pathname, PROTECTED_PREFIXES) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (matchesPrefix(pathname, AUTH_ROUTES) && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, the API proxy namespace, and any request for a file with an extension.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
