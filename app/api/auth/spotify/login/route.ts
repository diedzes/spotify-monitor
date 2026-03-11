/**
 * Start Spotify OAuth – zoals in het officiële voorbeeld:
 * https://github.com/spotify/web-api-examples/tree/master/authorization/authorization_code
 */
import { NextResponse } from "next/server";
import {
  generateState,
  getRedirectUri,
  getStateCookieName,
  getStateCookieMaxAge,
} from "@/lib/spotify-auth";

const SCOPE = "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-read-email";

export async function GET(request: Request) {
  const state = generateState();
  const redirectUri = getRedirectUri();
  const clientId = process.env.AUTH_SPOTIFY_ID ?? process.env.SPOTIFY_CLIENT_ID ?? "";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: redirectUri,
    state,
  });

  const res = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`, 302);
  res.cookies.set(getStateCookieName(), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: getStateCookieMaxAge(),
    path: "/",
  });
  return res;
}
