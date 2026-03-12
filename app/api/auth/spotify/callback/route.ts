/**
 * Spotify OAuth callback – wisselt code voor tokens (zoals officieel voorbeeld).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  getSpotifyProfile,
  encodeSessionId,
  getBaseUrl,
  getStateCookieName,
  getSessionCookieName,
  getSessionCookieMaxAge,
  SESSION_HEADER_COOKIE,
} from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

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
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

    const session = await prisma.session.create({
      data: {
        userId: profile.id,
        userName: profile.display_name,
        userEmail: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
      },
    });

    const baseUrl = getBaseUrl();
    const signedSessionId = encodeSessionId(session.id);
    const dashboardUrl = new URL("/dashboard", baseUrl);
    dashboardUrl.searchParams.set("sid", signedSessionId);
    const res = NextResponse.redirect(dashboardUrl, 302);
    res.cookies.set(getStateCookieName(), "", { maxAge: 0, path: "/" });
    const isProduction = process.env.NODE_ENV === "production";
    res.cookies.set(getSessionCookieName(), signedSessionId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: getSessionCookieMaxAge(),
      path: "/",
    });
    res.cookies.set(SESSION_HEADER_COOKIE, signedSessionId, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: getSessionCookieMaxAge(),
      path: "/",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(new URL(`/?error=spotify&error_description=${encodeURIComponent(message)}`, request.url), 302);
  }
}
