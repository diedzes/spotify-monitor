import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { computeRunQuality, setLockForSlot } from "@/lib/scheduler-engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, runId } = await params;
  const scheduler = await prisma.scheduler.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!scheduler) return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { position?: number; locked?: boolean };
  if (!Number.isInteger(body.position) || (body.position ?? 0) <= 0 || typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "position and locked are required" }, { status: 400 });
  }
  try {
    const rows = await setLockForSlot(id, runId, body.position!, body.locked);
    const quality = await computeRunQuality(id, rows);
    return NextResponse.json({ ok: true, rows, quality });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update lock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

