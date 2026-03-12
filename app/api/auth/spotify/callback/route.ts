/**
 * Spotify OAuth callback – wisselt code voor tokens (zoals officieel voorbeeld).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  getSpotifyProfile,
  encodeSession,
  getBaseUrl,
  getStateCookieName,
  getSessionCookieName,
  getSessionCookieMaxAge,
  type SpotifySession,
} from "@/lib/spotify-auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(getStateCookieName())?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/?error=spotify&error_description=${encodeURIComponent(error)}`, request.url), 302);
  }

  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=state_mismatch", request.url), 302);
  }

  cookieStore.delete(getStateCookieName());

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url), 302);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getSpotifyProfile(tokens.access_token);

    const session: SpotifySession = {
      user: {
        id: profile.id,
        name: profile.display_name,
        email: profile.email,
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
    };

    const baseUrl = getBaseUrl();
    const res = NextResponse.redirect(new URL("/dashboard", baseUrl), 302);
    res.cookies.set(getStateCookieName(), "", { maxAge: 0, path: "/" });
    res.cookies.set(getSessionCookieName(), encodeSession(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: getSessionCookieMaxAge(),
      path: "/",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(new URL(`/?error=spotify&error_description=${encodeURIComponent(message)}`, request.url), 302);
  }
}
