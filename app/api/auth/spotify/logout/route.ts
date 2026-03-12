import { NextResponse } from "next/server";
import { getSessionCookieName, decodeSessionId } from "@/lib/spotify-auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getBaseUrl } from "@/lib/spotify-auth";

export async function GET(request: Request) {
  const store = await cookies();
  const value = store.get(getSessionCookieName())?.value;
  if (value) {
    const sessionId = decodeSessionId(value);
    if (sessionId) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    }
  }
  const baseUrl = getBaseUrl();
  const res = NextResponse.redirect(new URL("/", baseUrl), 302);
  res.cookies.set(getSessionCookieName(), "", { maxAge: 0, path: "/" });
  return res;
}
