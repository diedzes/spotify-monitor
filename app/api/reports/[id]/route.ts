import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const report = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      include: {
        sources: {
          include: {
            trackedPlaylist: { select: { id: true, name: true, trackCount: true, followerCount: true } },
            playlistGroup: {
              include: {
                groupPlaylists: {
                  include: { trackedPlaylist: { select: { name: true } } },
                },
              },
            },
          },
        },
        results: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });
    if (!report) {
      return NextResponse.json({ error: "Report niet gevonden" }, { status: 404 });
    }
    const latestResult = report.results[0] ?? null;
    return NextResponse.json({
    report: {
      id: report.id,
      name: report.name,
      description: report.description,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    },
    sources: report.sources.map((s) => ({
      id: s.id,
      trackedPlaylistId: s.trackedPlaylistId,
      playlistGroupId: s.playlistGroupId,
      weight: s.weight,
      include: s.include,
      type: s.trackedPlaylistId ? "playlist" : "group",
      name: s.trackedPlaylist?.name ?? s.playlistGroup?.name ?? "",
      trackCount: s.trackedPlaylist?.trackCount ?? null,
      followerCount: s.trackedPlaylist?.followerCount ?? null,
      expandedPlaylists:
        s.playlistGroup?.groupPlaylists?.map((gp) => gp.trackedPlaylist?.name ?? "").filter(Boolean) ?? [],
    })),
    latestResult: latestResult
      ? {
          id: latestResult.id,
          generatedAt: latestResult.generatedAt.toISOString(),
          rowsJson: latestResult.rowsJson,
          editedRowsJson: latestResult.editedRowsJson,
        }
      : null,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Databasefout";
    console.error("[GET /api/reports/[id]]", message);
    return NextResponse.json(
      { error: `Kon report niet laden: ${message}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id } = await params;
  const report = await prisma.report.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!report) {
    return NextResponse.json({ error: "Report niet gevonden" }, { status: 404 });
  }
  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const description =
    typeof body.description === "string" ? body.description.trim() || null : undefined;
  const updated = await prisma.report.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      updatedAt: new Date(),
    },
  });
  return NextResponse.json({
    ok: true,
    report: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id } = await params;
  const report = await prisma.report.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!report) {
    return NextResponse.json({ error: "Report niet gevonden" }, { status: 404 });
  }
  await prisma.report.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
