import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/promo-tracks/link
// Body: { promoTrackId: string; spotifyTrackId: string | null }
// Koppelt (of ontkoppelt) een PromoTrack aan een Spotify track.
export async function PATCH(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as {
    promoTrackId?: string;
    spotifyTrackId?: string | null;
  };

  if (!body.promoTrackId) {
    return NextResponse.json({ error: "promoTrackId verplicht" }, { status: 400 });
  }

  const track = await prisma.promoTrack.findFirst({
    where: { id: body.promoTrackId, userId: session.user.id },
  });
  if (!track) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  const updated = await prisma.promoTrack.update({
    where: { id: body.promoTrackId },
    data: { spotifyTrackId: body.spotifyTrackId ?? null },
  });

  return NextResponse.json({ ok: true, track: updated });
}

// GET /api/promo-tracks/link?spotifyTrackIds=id1,id2,...
// Geeft mapping spotifyTrackId → { id, label, fatdropUrl }
export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const ids = (url.searchParams.get("spotifyTrackIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!ids.length) return NextResponse.json({ map: {} });

  const rows = await prisma.promoTrack.findMany({
    where: { userId: session.user.id, spotifyTrackId: { in: ids } },
    select: { id: true, label: true, fatdropUrl: true, spotifyTrackId: true },
  });

  const map: Record<string, { id: string; label: string; fatdropUrl: string }> = {};
  for (const r of rows) {
    if (r.spotifyTrackId) map[r.spotifyTrackId] = { id: r.id, label: r.label, fatdropUrl: r.fatdropUrl };
  }

  return NextResponse.json({ map });
}
