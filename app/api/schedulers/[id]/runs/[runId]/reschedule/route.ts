import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { rescheduleFromPosition } from "@/lib/scheduler-engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id, runId } = await params;
  const scheduler = await prisma.scheduler.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { fromPosition?: number };
  if (!Number.isInteger(body.fromPosition) || (body.fromPosition ?? 0) <= 0) {
    return NextResponse.json({ error: "fromPosition moet een positief getal zijn" }, { status: 400 });
  }
  try {
    const rows = await rescheduleFromPosition(id, runId, body.fromPosition!);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reschedule mislukt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

