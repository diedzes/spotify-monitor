import { NextResponse } from "next/server";

/**
 * Controle: welke auth-variabelen en callback-URL gebruikt deze deployment.
 * Open op dezelfde URL waar je inlogt (bijv. https://spotify-monitor-ten.vercel.app/api/auth-check).
 */
export async function GET() {
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const callbackUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/api/auth/callback/spotify`
    : "—";

  const vars = {
    CALLBACK_URL_VOOR_SPOTIFY_REDIRECT_URIS: callbackUrl,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "niet gezet",
    VERCEL_URL: process.env.VERCEL_URL ?? "niet gezet",
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "niet gezet",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? "set" : "niet gezet",
    AUTH_SPOTIFY_ID: process.env.AUTH_SPOTIFY_ID ? "set" : "niet gezet",
    AUTH_SPOTIFY_SECRET: process.env.AUTH_SPOTIFY_SECRET ? "set" : "niet gezet",
  };

  return NextResponse.json(vars, { status: 200 });
}
