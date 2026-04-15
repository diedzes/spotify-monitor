import { NextResponse } from "next/server";
import { deleteContact, getContactById, updateContact } from "@/lib/contacts";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const contact = await getContactById(session.user.id, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  return NextResponse.json({
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
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
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
    const contact = await updateContact(session.user.id, id, body);
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
    const message = e instanceof Error ? e.message : "Could not update contact";
    const status = message === "Contact not found" || message === "Organization not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  try {
    await deleteContact(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete contact";
    const status = message === "Contact not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
