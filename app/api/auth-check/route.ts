import { NextResponse } from "next/server";

/**
 * Controleer of auth-gerelateerde env vars zichtbaar zijn voor deze deployment.
 * Geen waarden tonen, alleen "set" of "niet gezet".
 * Verwijder deze route later in productie als je wilt.
 */
export async function GET() {
  const vars = {
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "niet gezet",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "niet gezet",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? "set" : "niet gezet",
    AUTH_SPOTIFY_ID: process.env.AUTH_SPOTIFY_ID ? "set" : "niet gezet",
    AUTH_SPOTIFY_SECRET: process.env.AUTH_SPOTIFY_SECRET ? "set" : "niet gezet",
    AUTH_URL: process.env.AUTH_URL ? "set" : "niet gezet",
    VERCEL_URL: process.env.VERCEL_URL ?? "niet gezet",
  };

  return NextResponse.json(vars, { status: 200 });
}
