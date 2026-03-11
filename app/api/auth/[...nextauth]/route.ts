import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, lastSpotifyTokenError, clearLastSpotifyTokenError } from "@/auth";

const handler = NextAuth(authOptions);

async function withSpotifyErrorCookie(req: Request): Promise<Response> {
  const res = await handler(req);
  if (res?.status === 302 && lastSpotifyTokenError) {
    const location = res.headers.get("Location") ?? "";
    const err = lastSpotifyTokenError;
    clearLastSpotifyTokenError();
    const nextRes = NextResponse.redirect(location, 302);
    nextRes.cookies.set("spotify_token_error", err, {
      path: "/",
      maxAge: 120,
      httpOnly: true,
      sameSite: "lax",
    });
    return nextRes;
  }
  return res;
}

export const GET = (req: Request) => withSpotifyErrorCookie(req);
export const POST = (req: Request) => withSpotifyErrorCookie(req);
