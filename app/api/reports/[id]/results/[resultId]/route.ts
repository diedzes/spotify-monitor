import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sla de bewerkte chart op in editedRowsJson. rowsJson (origineel) blijft ongewijzigd.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; resultId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id: reportId, resultId } = await params;
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: session.user.id },
  });
  if (!report) {
    return NextResponse.json({ error: "Report niet gevonden" }, { status: 404 });
  }
  const result = await prisma.reportResult.findFirst({
    where: { id: resultId, reportId },
  });
  if (!result) {
    return NextResponse.json({ error: "Resultaat niet gevonden" }, { status: 404 });
  }
  let body: { editedRowsJson?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const raw =
    typeof body.editedRowsJson === "string" ? body.editedRowsJson.trim() || null : null;
  const editedRowsJson: Prisma.InputJsonValue | null = raw;
  await prisma.reportResult.update({
    where: { id: resultId },
    data: {
      editedRowsJson: editedRowsJson === null ? Prisma.JsonNull : editedRowsJson,
    },
  });
  return NextResponse.json({
    ok: true,
    result: {
      id: resultId,
      editedRowsJson: raw,
    },
  });
}
