import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/spotify-auth";

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/", request.url), 302);
  res.cookies.set(getSessionCookieName(), "", { maxAge: 0, path: "/" });
  return res;
}
