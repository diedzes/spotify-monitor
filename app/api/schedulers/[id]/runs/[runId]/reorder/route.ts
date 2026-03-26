import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { reorderRunRows } from "@/lib/scheduler-engine";
import type { ScheduledRow } from "@/lib/scheduler-types";

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

  const body = (await request.json().catch(() => ({}))) as { rows?: ScheduledRow[] };
  const rows = body.rows;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows moet een array zijn" }, { status: 400 });
  }

  try {
    const nextRows = await reorderRunRows(id, runId, rows);
    return NextResponse.json({ ok: true, rows: nextRows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reorder mislukt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
