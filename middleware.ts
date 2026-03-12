import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/auth/callback/spotify") {
    console.error("[Spotify callback ontvangen]", request.url);
  }
  if (request.nextUrl.pathname.startsWith("/playlists")) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/callback/spotify", "/playlists", "/playlists/:path*"],
};
