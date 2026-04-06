import { NextResponse } from "next/server";

/**
 * Controle: welke auth-variabelen en callback-URL gebruikt deze deployment.
 * Open op dezelfde URL waar je inlogt (bijv. https://spotify-monitor-ten.vercel.app/api/auth-check).
 * Spotify: redirect URI moet exact overeenkomen – https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
 */
export async function GET() {
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const baseNormalized = baseUrl ? baseUrl.replace(/\/$/, "") : null;
  const callbackUrl = baseNormalized
    ? `${baseNormalized}/api/auth/spotify/callback`
    : "—";

  const isLocalhost =
    baseNormalized?.includes("localhost") ?? false;
  const redirectUriWarning = isLocalhost
    ? "Spotify does not allow 'localhost' as a redirect URI. For local testing use http://127.0.0.1:PORT and add that exact URL + /api/auth/spotify/callback in the Spotify dashboard."
    : null;

  const vars = {
    CALLBACK_URL_VOOR_SPOTIFY_REDIRECT_URIS: callbackUrl,
    REDIRECT_URI_WARNING: redirectUriWarning,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "not set",
    VERCEL_URL: process.env.VERCEL_URL ?? "not set",
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "not set",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? "set" : "not set",
    AUTH_SPOTIFY_ID: process.env.AUTH_SPOTIFY_ID ? "set" : "not set",
    AUTH_SPOTIFY_SECRET: process.env.AUTH_SPOTIFY_SECRET ? "set" : "not set",
  };

  return NextResponse.json(vars, { status: 200 });
}
