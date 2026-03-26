import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { moveSlotInRun } from "@/lib/scheduler-engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id, runId } = await params;
  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    fromPosition?: number;
    toPosition?: number;
  };
  const fromPosition = body.fromPosition;
  const toPosition = body.toPosition;
  if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition)) {
    return NextResponse.json({ error: "fromPosition en toPosition zijn verplicht" }, { status: 400 });
  }

  try {
    const rows = await moveSlotInRun(id, runId, fromPosition!, toPosition!);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verplaatsen mislukt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
