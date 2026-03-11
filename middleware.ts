import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/auth/callback/spotify") {
    console.error("[Spotify callback ontvangen]", request.url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/auth/callback/spotify",
};
