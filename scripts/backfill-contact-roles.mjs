/**
 * Backfill Contact.role from the TYPE column in scripts/contact-role-backfill-data.json
 *
 * Usage:
 *   node scripts/backfill-contact-roles.mjs              # dry-run (default)
 *   node scripts/backfill-contact-roles.mjs --apply    # write to DB
 *   node scripts/backfill-contact-roles.mjs --apply --force  # overwrite existing role
 *
 * Requires DATABASE_URL (e.g. from .env). Optional: SPOTIFY_USER_ID to limit to one user.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const userIdFilter = process.env.SPOTIFY_USER_ID?.trim() || null;

/** @type {{ fullName: string; role: string; emails: string[]; organization: string }[]} */
const rows = JSON.parse(
  readFileSync(join(__dirname, "contact-role-backfill-data.json"), "utf8")
);

function normalizeText(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u2010-\u2015\u2212\u00AD]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  if (!value) return null;
  return value.trim().toLowerCase();
}

function orgMatches(snapshot, organization) {
  if (!snapshot || !organization) return true;
  const a = normalizeText(snapshot);
  const b = normalizeText(organization);
  return a.includes(b) || b.includes(a);
}

function nameMatches(dbName, rowName) {
  const a = normalizeText(dbName);
  const b = normalizeText(rowName);
  if (a === b) return true;
  // "Jan-Willem (Walterwitlov)" vs "Jan‑Willem (Walterwitlov)"
  const aBase = a.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const bBase = b.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return aBase === bBase || a.includes(bBase) || b.includes(aBase);
}

async function main() {
  const where = userIdFilter ? { userId: userIdFilter } : {};
  const contacts = await prisma.contact.findMany({
    where,
    select: {
      id: true,
      userId: true,
      fullName: true,
      email: true,
      role: true,
      organizationNameSnapshot: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const row of rows) {
    const emails = row.emails.map((e) => normalizeEmail(e)).filter(Boolean);
    let matches = contacts.filter((c) => {
      const cEmail = normalizeEmail(c.email);
      if (emails.length > 0 && cEmail && emails.includes(cEmail)) {
        return orgMatches(c.organizationNameSnapshot, row.organization);
      }
      if (emails.length > 0) return false;
      return (
        nameMatches(c.fullName, row.fullName) &&
        orgMatches(c.organizationNameSnapshot, row.organization)
      );
    });

    if (matches.length > 1) {
      matches = matches.filter(
        (c) =>
          nameMatches(c.fullName, row.fullName) &&
          orgMatches(c.organizationNameSnapshot, row.organization)
      );
    }

    if (matches.length === 0) {
      unmatched++;
      console.log(`[miss] ${row.fullName} (${row.organization}) → ${row.role}`);
      continue;
    }

    if (matches.length > 1) {
      console.log(
        `[ambig] ${row.fullName}: ${matches.length} contacts — ${matches.map((c) => c.fullName).join(", ")}`
      );
      continue;
    }

    const contact = matches[0];
    if (contact.role && !force && contact.role !== row.role) {
      skipped++;
      console.log(
        `[skip] ${contact.fullName}: role already "${contact.role}" (use --force for "${row.role}")`
      );
      continue;
    }
    if (contact.role === row.role) {
      skipped++;
      continue;
    }

    if (apply) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { role: row.role },
      });
    }

    updated++;
    console.log(
      `${apply ? "[ok]" : "[dry]"} ${contact.fullName} → role "${row.role}"${contact.role ? ` (was "${contact.role}")` : ""}`
    );
  }

  console.log(
    `\n${apply ? "Applied" : "Dry run"}: ${updated} update(s), ${skipped} skipped, ${unmatched} unmatched (of ${rows.length} rows).`
  );
  if (!apply) console.log("Re-run with --apply to write changes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
