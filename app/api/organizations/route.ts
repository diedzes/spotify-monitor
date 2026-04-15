import { NextResponse } from "next/server";
import { createOrganization, getOrganizations } from "@/lib/contacts";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? undefined;
  const organizations = await getOrganizations(session.user.id, { query });

  return NextResponse.json({
    organizations: organizations.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      notes: o.notes,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      contactCount: o._count.contacts,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { name?: string; type?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const organization = await createOrganization(session.user.id, {
      name: body.name ?? "",
      type: body.type,
      notes: body.notes,
    });
    return NextResponse.json({
      ok: true,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        notes: organization.notes,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create organization";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
