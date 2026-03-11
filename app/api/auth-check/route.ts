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
    ? `${baseNormalized}/api/auth/callback/spotify`
    : "—";

  const isLocalhost =
    baseNormalized?.includes("localhost") ?? false;
  const redirectUriWarning = isLocalhost
    ? "Spotify staat 'localhost' niet toe als redirect URI. Gebruik voor lokaal testen http://127.0.0.1:PORT (bijv. http://127.0.0.1:3000) en voeg die exacte URL + /api/auth/callback/spotify toe in het Spotify-dashboard."
    : null;

  const vars = {
    CALLBACK_URL_VOOR_SPOTIFY_REDIRECT_URIS: callbackUrl,
    REDIRECT_URI_WARNING: redirectUriWarning,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "niet gezet",
    VERCEL_URL: process.env.VERCEL_URL ?? "niet gezet",
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "niet gezet",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? "set" : "niet gezet",
    AUTH_SPOTIFY_ID: process.env.AUTH_SPOTIFY_ID ? "set" : "niet gezet",
    AUTH_SPOTIFY_SECRET: process.env.AUTH_SPOTIFY_SECRET ? "set" : "niet gezet",
  };

  return NextResponse.json(vars, { status: 200 });
}
