import { NextResponse } from "next/server";
import { createContact, getContacts } from "@/lib/contacts";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? undefined;
  const organizationId = url.searchParams.get("organizationId") ?? undefined;
  const contacts = await getContacts(session.user.id, { query, organizationId });

  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      organizationId: c.organizationId,
      organizationName: c.organization?.name ?? c.organizationNameSnapshot ?? null,
      organizationNameSnapshot: c.organizationNameSnapshot,
      email: c.email,
      phone: c.phone,
      role: c.role,
      notes: c.notes,
      source: c.source,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: {
    fullName?: string;
    organizationId?: string | null;
    organizationNameSnapshot?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    notes?: string | null;
    source?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const contact = await createContact(session.user.id, {
      fullName: body.fullName ?? "",
      organizationId: body.organizationId,
      organizationNameSnapshot: body.organizationNameSnapshot,
      email: body.email,
      phone: body.phone,
      role: body.role,
      notes: body.notes,
      source: body.source,
    });
    return NextResponse.json({
      ok: true,
      contact: {
        id: contact.id,
        fullName: contact.fullName,
        organizationId: contact.organizationId,
        organizationName: contact.organization?.name ?? contact.organizationNameSnapshot ?? null,
        organizationNameSnapshot: contact.organizationNameSnapshot,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        notes: contact.notes,
        source: contact.source,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
