import { NextResponse } from "next/server";
import { createContact, getContacts, getRecentContacts } from "@/lib/contacts";
import { parseContactStatus } from "@/lib/contact-status";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? undefined;
  const organizationId = url.searchParams.get("organizationId") ?? undefined;
  const contactStatusParam = url.searchParams.get("contactStatus");
  const parsedStatus = contactStatusParam ? parseContactStatus(contactStatusParam) : undefined;
  const contactStatus = parsedStatus ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const recent = url.searchParams.get("recent") === "1";
  const contacts = recent
    ? await getRecentContacts(session.user.id)
    : await getContacts(session.user.id, { query, organizationId, contactStatus, limit });

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
      contactStatus: c.contactStatus,
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
    contactStatus?: string | null;
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
      contactStatus: body.contactStatus !== undefined ? parseContactStatus(body.contactStatus) : undefined,
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
        contactStatus: contact.contactStatus,
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
