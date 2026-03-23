import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getOwnedSource(userId: string, schedulerId: string, sourceId: string) {
  const scheduler = await prisma.scheduler.findFirst({
    where: { id: schedulerId, userId },
  });
  if (!scheduler) return null;
  const source = await prisma.schedulerSource.findFirst({
    where: { id: sourceId, schedulerId },
  });
  return source ?? null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id: schedulerId, sourceId } = await params;
  const source = await getOwnedSource(session.user.id, schedulerId, sourceId);
  if (!source) return NextResponse.json({ error: "Bron niet gevonden" }, { status: 404 });

  let body: {
    include?: boolean;
    weight?: number | null;
    selectionMode?: "random" | "rank_preferred";
    rankBiasStrength?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }

  const include = typeof body.include === "boolean" ? body.include : undefined;
  const weight =
    typeof body.weight === "number" && Number.isFinite(body.weight)
      ? body.weight
      : body.weight === null
        ? null
        : undefined;
  const selectionMode =
    body.selectionMode === "random" || body.selectionMode === "rank_preferred"
      ? body.selectionMode
      : undefined;
  const rankBiasStrength =
    typeof body.rankBiasStrength === "number" && Number.isInteger(body.rankBiasStrength)
      ? body.rankBiasStrength
      : body.rankBiasStrength === null
        ? null
        : undefined;

  const updated = await prisma.schedulerSource.update({
    where: { id: sourceId },
    data: {
      ...(include !== undefined && { include }),
      ...(weight !== undefined && { weight }),
      ...(selectionMode !== undefined && { selectionMode }),
      ...(rankBiasStrength !== undefined && { rankBiasStrength }),
    },
  });

  return NextResponse.json({
    ok: true,
    source: {
      id: updated.id,
      include: updated.include,
      weight: updated.weight,
      selectionMode: updated.selectionMode,
      rankBiasStrength: updated.rankBiasStrength,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id: schedulerId, sourceId } = await params;
  const source = await getOwnedSource(session.user.id, schedulerId, sourceId);
  if (!source) return NextResponse.json({ error: "Bron niet gevonden" }, { status: 404 });
  await prisma.schedulerSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}

