import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Item = {
  trackedPlaylistId?: string | null;
  playlistGroupId?: string | null;
  overlapPercent: number;
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await params;

  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  let body: { items?: Item[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  for (const it of items) {
    const hasP = !!it.trackedPlaylistId?.trim();
    const hasG = !!it.playlistGroupId?.trim();
    if (hasP === hasG) {
      return NextResponse.json(
        { error: "Elke overlap-regel moet precies één playlist of één groep hebben." },
        { status: 400 }
      );
    }
    if (!Number.isInteger(it.overlapPercent) || it.overlapPercent < 0 || it.overlapPercent > 100) {
      return NextResponse.json({ error: "overlapPercent moet tussen 0 en 100 liggen." }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.schedulerOverlapPreference.deleteMany({ where: { schedulerId: id } });
    for (const it of items) {
      await tx.schedulerOverlapPreference.create({
        data: {
          schedulerId: id,
          trackedPlaylistId: it.trackedPlaylistId?.trim() || null,
          playlistGroupId: it.playlistGroupId?.trim() || null,
          overlapPercent: it.overlapPercent,
        },
      });
    }
  });

  const prefs = await prisma.schedulerOverlapPreference.findMany({
    where: { schedulerId: id },
    include: {
      trackedPlaylist: { select: { id: true, name: true } },
      playlistGroup: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({
    ok: true,
    overlapPreferences: prefs.map((p) => ({
      id: p.id,
      trackedPlaylistId: p.trackedPlaylistId,
      playlistGroupId: p.playlistGroupId,
      overlapPercent: p.overlapPercent,
      name: p.trackedPlaylist?.name ?? p.playlistGroup?.name ?? "",
    })),
  });
}
