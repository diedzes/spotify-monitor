import { prisma } from "@/lib/db";

type OrganizationInput = {
  name: string;
  type?: string | null;
  notes?: string | null;
};

type OrganizationUpdateInput = {
  name?: string;
  type?: string | null;
  notes?: string | null;
};

type ContactInput = {
  fullName: string;
  organizationId?: string | null;
  organizationNameSnapshot?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  notes?: string | null;
  source?: string | null;
};

type ContactUpdateInput = {
  fullName?: string;
  organizationId?: string | null;
  organizationNameSnapshot?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  notes?: string | null;
  source?: string | null;
};

type ContactQuery = {
  query?: string;
  organizationId?: string;
  limit?: number;
};

function cleanString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function toEmail(value: string | null | undefined): string | null {
  const v = cleanString(value);
  return v ? v.toLowerCase() : null;
}

async function assertOrganizationOwned(userId: string, organizationId: string) {
  const org = await prisma.organization.findFirst({ where: { id: organizationId, userId } });
  if (!org) throw new Error("Organization not found");
  return org;
}

export async function createOrganization(userId: string, data: OrganizationInput) {
  const name = cleanString(data.name);
  if (!name) throw new Error("Organization name is required");
  return prisma.organization.create({
    data: {
      userId,
      name,
      type: cleanString(data.type),
      notes: cleanString(data.notes),
    },
  });
}

export async function updateOrganization(userId: string, organizationId: string, data: OrganizationUpdateInput) {
  const existing = await prisma.organization.findFirst({ where: { id: organizationId, userId } });
  if (!existing) throw new Error("Organization not found");

  const patch: { name?: string; type?: string | null; notes?: string | null } = {};
  if (data.name !== undefined) {
    const name = cleanString(data.name);
    if (!name) throw new Error("Organization name cannot be empty");
    patch.name = name;
  }
  if (data.type !== undefined) patch.type = cleanString(data.type);
  if (data.notes !== undefined) patch.notes = cleanString(data.notes);
  if (Object.keys(patch).length === 0) return existing;

  return prisma.organization.update({ where: { id: organizationId }, data: patch });
}

export async function getOrganizations(userId: string, query?: { query?: string }) {
  const q = cleanString(query?.query);
  return prisma.organization.findMany({
    where: {
      userId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { contacts: true } },
    },
  });
}

export async function getOrganizationById(userId: string, organizationId: string) {
  return prisma.organization.findFirst({
    where: { id: organizationId, userId },
    include: {
      contacts: {
        where: { userId },
        orderBy: [{ fullName: "asc" }],
      },
      _count: { select: { contacts: true } },
    },
  });
}

export async function createContact(userId: string, data: ContactInput) {
  const fullName = cleanString(data.fullName);
  if (!fullName) throw new Error("Full name is required");

  let organizationId: string | null = data.organizationId ?? null;
  let organizationNameSnapshot = cleanString(data.organizationNameSnapshot);

  if (organizationId) {
    const org = await assertOrganizationOwned(userId, organizationId);
    organizationNameSnapshot = org.name;
  }

  return prisma.contact.create({
    data: {
      userId,
      fullName,
      organizationId,
      organizationNameSnapshot,
      email: toEmail(data.email),
      phone: cleanString(data.phone),
      role: cleanString(data.role),
      notes: cleanString(data.notes),
      source: cleanString(data.source),
    },
    include: { organization: true },
  });
}

export async function updateContact(userId: string, contactId: string, data: ContactUpdateInput) {
  const existing = await prisma.contact.findFirst({ where: { id: contactId, userId }, include: { organization: true } });
  if (!existing) throw new Error("Contact not found");

  const patch: {
    fullName?: string;
    organizationId?: string | null;
    organizationNameSnapshot?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    notes?: string | null;
    source?: string | null;
  } = {};

  if (data.fullName !== undefined) {
    const fullName = cleanString(data.fullName);
    if (!fullName) throw new Error("Full name cannot be empty");
    patch.fullName = fullName;
  }
  if (data.organizationId !== undefined) patch.organizationId = cleanString(data.organizationId);
  if (data.organizationNameSnapshot !== undefined) patch.organizationNameSnapshot = cleanString(data.organizationNameSnapshot);
  if (data.email !== undefined) patch.email = toEmail(data.email);
  if (data.phone !== undefined) patch.phone = cleanString(data.phone);
  if (data.role !== undefined) patch.role = cleanString(data.role);
  if (data.notes !== undefined) patch.notes = cleanString(data.notes);
  if (data.source !== undefined) patch.source = cleanString(data.source);

  if (patch.organizationId) {
    const org = await assertOrganizationOwned(userId, patch.organizationId);
    patch.organizationNameSnapshot = org.name;
  }
  if (patch.organizationId === null && data.organizationNameSnapshot === undefined) {
    patch.organizationNameSnapshot = null;
  }

  if (Object.keys(patch).length === 0) return existing;
  return prisma.contact.update({
    where: { id: contactId },
    data: patch,
    include: { organization: true },
  });
}

export async function getContacts(userId: string, query?: ContactQuery) {
  const q = cleanString(query?.query);
  const limit = query?.limit && query.limit > 0 ? Math.min(query.limit, 500) : undefined;
  return prisma.contact.findMany({
    where: {
      userId,
      ...(query?.organizationId ? { organizationId: query.organizationId } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { organizationNameSnapshot: { contains: q, mode: "insensitive" } },
              { email: { contains: q.toLowerCase(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { fullName: "asc" }],
    take: limit,
    include: { organization: true },
  });
}

export async function getContactById(userId: string, contactId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, userId },
    include: { organization: true },
  });
}

export async function searchContacts(userId: string, query: string) {
  return getContacts(userId, { query, limit: 50 });
}

export async function getRecentContacts(userId: string, limit = 6) {
  const recent = await prisma.feedbackEntry.findMany({
    where: { userId, contactId: { not: null } },
    orderBy: { feedbackAt: "desc" },
    select: {
      contactId: true,
      feedbackAt: true,
      contact: {
        include: { organization: true },
      },
    },
    take: Math.min(limit * 4, 40),
  });

  const seen = new Set<string>();
  const out: NonNullable<(typeof recent)[number]["contact"]>[] = [];
  for (const row of recent) {
    const contact = row.contact;
    if (!contact || !row.contactId || seen.has(row.contactId)) continue;
    seen.add(row.contactId);
    out.push(contact);
    if (out.length >= limit) break;
  }
  return out;
}

export async function deleteContact(userId: string, contactId: string) {
  const existing = await prisma.contact.findFirst({ where: { id: contactId, userId }, select: { id: true } });
  if (!existing) throw new Error("Contact not found");
  await prisma.contact.delete({ where: { id: contactId } });
  return { ok: true };
}

/**
 * Import helper base for future spreadsheet/CRM sync:
 * a practical matching key using normalized full name + organization snapshot.
 */
export function contactMatchKey(input: { fullName?: string | null; organizationName?: string | null }): string | null {
  const name = cleanString(input.fullName)?.toLowerCase();
  if (!name) return null;
  const org = cleanString(input.organizationName)?.toLowerCase() ?? "";
  return `${name}\u0000${org}`;
}
