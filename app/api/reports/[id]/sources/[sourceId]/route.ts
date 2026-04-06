import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: reportId, sourceId } = await params;
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: session.user.id },
    include: { sources: { where: { id: sourceId } } },
  });
  if (!report || report.sources.length === 0) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
  let body: { weight?: number; include?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const weight =
    typeof body.weight === "number" && body.weight >= 0 ? body.weight : undefined;
  const include = typeof body.include === "boolean" ? body.include : undefined;
  const updated = await prisma.reportSource.update({
    where: { id: sourceId },
    data: {
      ...(weight !== undefined && { weight }),
      ...(include !== undefined && { include }),
    },
  });
  return NextResponse.json({
    ok: true,
    source: {
      id: updated.id,
      weight: updated.weight,
      include: updated.include,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id: reportId, sourceId } = await params;
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId: session.user.id },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const source = await prisma.reportSource.findFirst({
    where: { id: sourceId, reportId },
  });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
  await prisma.reportSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}
