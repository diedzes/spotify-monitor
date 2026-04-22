import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { fetchRecentMatches } from "@/lib/football-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "14");
  const safeDays = Number.isFinite(days) ? Math.min(45, Math.max(3, Math.trunc(days))) : 14;

  try {
    const matches = await fetchRecentMatches(safeDays);
    return NextResponse.json({ ok: true, matches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load matches";
    if (msg.startsWith("FOOTBALL_DATA_API_")) {
      return NextResponse.json({ error: "Football-data API probleem. Controleer token/rate limit." }, { status: 502 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
