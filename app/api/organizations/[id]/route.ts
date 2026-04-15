import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { getOrganizationById, updateOrganization } from "@/lib/contacts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const org = await getOrganizationById(session.user.id, id);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  return NextResponse.json({
    organization: {
      id: org.id,
      name: org.name,
      notes: org.notes,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      contactCount: org._count.contacts,
    },
    contacts: org.contacts.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      role: c.role,
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  let body: { name?: string; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const org = await updateOrganization(session.user.id, id, body);
    return NextResponse.json({
      ok: true,
      organization: {
        id: org.id,
        name: org.name,
        notes: org.notes,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update organization";
    const status = message === "Organization not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
