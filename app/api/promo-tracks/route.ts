import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/promo-tracks — haal alle promo tracks op voor de ingelogde gebruiker
export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const tracks = await prisma.promoTrack.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tracks });
}

// POST /api/promo-tracks — maak één of meerdere promo tracks aan
// Body: { tracks: Array<{ label: string; fatdropUrl: string; spotifyTrackId?: string }> }
export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as {
    tracks?: Array<{ label: string; fatdropUrl: string; spotifyTrackId?: string }>;
  };

  if (!Array.isArray(body.tracks) || body.tracks.length === 0) {
    return NextResponse.json({ error: "Geen tracks opgegeven" }, { status: 400 });
  }

  const toCreate = body.tracks.filter(
    (t) => typeof t.label === "string" && t.label.trim() && typeof t.fatdropUrl === "string" && t.fatdropUrl.trim()
  );

  if (toCreate.length === 0) {
    return NextResponse.json({ error: "Geen geldige tracks" }, { status: 400 });
  }

  const created = await prisma.promoTrack.createMany({
    data: toCreate.map((t) => ({
      userId: session.user.id,
      label: t.label.trim(),
      fatdropUrl: t.fatdropUrl.trim(),
      spotifyTrackId: t.spotifyTrackId ?? null,
    })),
  });

  return NextResponse.json({ ok: true, count: created.count });
}

// DELETE /api/promo-tracks — verwijder geselecteerde tracks
// Body: { ids: string[] }
export async function DELETE(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as { ids?: string[] };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "Geen ids opgegeven" }, { status: 400 });
  }

  await prisma.promoTrack.deleteMany({
    where: { id: { in: body.ids }, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
