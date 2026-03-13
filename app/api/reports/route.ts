import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const reports = await prisma.report.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sources: true, results: true } } },
  });
  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sourceCount: r._count.sources,
      resultCount: r._count.results,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;
  const report = await prisma.report.create({
    data: {
      userId: session.user.id,
      name,
      description,
      updatedAt: new Date(),
    },
  });
  return NextResponse.json({
    ok: true,
    report: {
      id: report.id,
      name: report.name,
      description: report.description,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    },
  });
}
