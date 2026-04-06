import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { buildChart, type ScoringMode } from "@/lib/chart-builder";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: reportId } = await params;
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: session.user.id },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  let body: { scoringMode?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const scoringMode: ScoringMode =
    body.scoringMode === "normalized" ? "normalized" : "rank_points";

  const { rows, errors } = await buildChart(reportId, session.user.id, scoringMode);
  const rowsJson = JSON.stringify(rows);
  const result = await prisma.reportResult.create({
    data: { reportId, rowsJson },
  });
  return NextResponse.json({
    ok: true,
    result: {
      id: result.id,
      generatedAt: result.generatedAt.toISOString(),
      rowCount: rows.length,
      errors: errors.length ? errors : undefined,
    },
    rows,
  });
}
