import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getOwnedScheduler(id: string, userId: string) {
  return prisma.scheduler.findFirst({
    where: { id, userId },
    include: {
      sources: {
        include: {
          trackedPlaylist: { select: { id: true, name: true } },
          playlistGroup: { select: { id: true, name: true, color: true } },
        },
        orderBy: { id: "asc" as const },
      },
      clockSlots: {
        include: {
          trackedPlaylist: { select: { id: true, name: true } },
          playlistGroup: { select: { id: true, name: true, color: true } },
        },
        orderBy: { position: "asc" as const },
      },
      rules: { orderBy: { ruleType: "asc" as const } },
      runs: { orderBy: { createdAt: "desc" as const }, take: 20 },
      reference: true,
      overlapPreferences: {
        include: {
          trackedPlaylist: { select: { id: true, name: true } },
          playlistGroup: { select: { id: true, name: true, color: true } },
        },
        orderBy: { id: "asc" as const },
      },
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const scheduler = await getOwnedScheduler(id, session.user.id);
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  return NextResponse.json({
    scheduler: {
      id: scheduler.id,
      name: scheduler.name,
      description: scheduler.description,
      mode: scheduler.mode,
      targetTrackCount: scheduler.targetTrackCount,
      ratioEvenDistribution: scheduler.ratioEvenDistribution,
      createdAt: scheduler.createdAt.toISOString(),
      updatedAt: scheduler.updatedAt.toISOString(),
    },
    sources: scheduler.sources.map((s) => ({
      id: s.id,
      trackedPlaylistId: s.trackedPlaylistId,
      playlistGroupId: s.playlistGroupId,
      include: s.include,
      weight: s.weight,
      selectionMode: s.selectionMode,
      rankBiasStrength: s.rankBiasStrength,
      type: s.trackedPlaylistId ? "playlist" : "group",
      name: s.trackedPlaylist?.name ?? s.playlistGroup?.name ?? "",
      groupColor: s.playlistGroup?.color ?? null,
    })),
    clockSlots: scheduler.clockSlots.map((slot) => ({
      id: slot.id,
      position: slot.position,
      trackedPlaylistId: slot.trackedPlaylistId,
      playlistGroupId: slot.playlistGroupId,
      spotifyTrackId: slot.spotifyTrackId,
      type: slot.trackedPlaylistId ? "playlist" : slot.playlistGroupId ? "group" : "track",
      name: slot.trackedPlaylist?.name ?? slot.playlistGroup?.name ?? slot.spotifyTrackId ?? "",
      groupColor: slot.playlistGroup?.color ?? null,
    })),
    rules: scheduler.rules.map((r) => ({
      id: r.id,
      ruleType: r.ruleType,
      valueInt: r.valueInt,
    })),
    runs: scheduler.runs.map((run) => ({
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      resultJson: run.resultJson,
      editedResultJson: run.editedResultJson,
      status: run.status,
    })),
    reference: scheduler.reference
      ? {
          id: scheduler.reference.id,
          updatedAt: scheduler.reference.updatedAt.toISOString(),
          trackCount: (() => {
            try {
              const a = JSON.parse(scheduler.reference.rowsJson) as unknown;
              return Array.isArray(a) ? a.length : 0;
            } catch {
              return 0;
            }
          })(),
        }
      : null,
    overlapPreferences: scheduler.overlapPreferences.map((p) => ({
      id: p.id,
      trackedPlaylistId: p.trackedPlaylistId,
      playlistGroupId: p.playlistGroupId,
      overlapPercent: p.overlapPercent,
      name: p.trackedPlaylist?.name ?? p.playlistGroup?.name ?? "",
      groupColor: p.playlistGroup?.color ?? null,
    })),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const exists = await prisma.scheduler.findFirst({ where: { id, userId: session.user.id } });
  if (!exists) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  let body: {
    name?: string;
    description?: string;
    mode?: "clock" | "ratio";
    targetTrackCount?: number;
    ratioEvenDistribution?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const description = typeof body.description === "string" ? body.description.trim() || null : undefined;
  const mode = body.mode === "clock" || body.mode === "ratio" ? body.mode : undefined;
  const targetTrackCount =
    typeof body.targetTrackCount === "number" &&
    Number.isInteger(body.targetTrackCount) &&
    body.targetTrackCount > 0
      ? body.targetTrackCount
      : body.targetTrackCount === undefined
        ? undefined
        : null;
  const ratioEvenDistribution =
    typeof body.ratioEvenDistribution === "boolean" ? body.ratioEvenDistribution : undefined;

  if (targetTrackCount === null) {
    return NextResponse.json({ error: "targetTrackCount must be a positive integer" }, { status: 400 });
  }
  if (name !== undefined && !name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const updated = await prisma.scheduler.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(mode !== undefined && { mode }),
      ...(targetTrackCount !== undefined && { targetTrackCount }),
      ...(ratioEvenDistribution !== undefined && { ratioEvenDistribution }),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    scheduler: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      mode: updated.mode,
      targetTrackCount: updated.targetTrackCount,
      ratioEvenDistribution: updated.ratioEvenDistribution,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const exists = await prisma.scheduler.findFirst({ where: { id, userId: session.user.id } });
  if (!exists) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });
  await prisma.scheduler.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

