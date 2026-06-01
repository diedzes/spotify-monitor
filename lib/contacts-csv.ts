import { contactStatusLabel, type ContactStatus } from "@/lib/contact-status";

export type ContactCsvRow = {
  fullName: string;
  email: string | null;
  organizationName: string | null;
  phone: string | null;
  role: string | null;
  contactStatus: ContactStatus | null;
  updatedAt: string;
};

function escapeCsvField(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function contactsToCsv(rows: ContactCsvRow[]): string {
  const header = ["name", "email", "organization", "phone", "role", "contact_status", "updated"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvField(r.fullName),
        escapeCsvField(r.email),
        escapeCsvField(r.organizationName),
        escapeCsvField(r.phone),
        escapeCsvField(r.role),
        escapeCsvField(contactStatusLabel(r.contactStatus)),
        escapeCsvField(
          new Date(r.updatedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
        ),
      ].join(",")
    );
  }
  return `\uFEFF${lines.join("\n")}`;
}

/** Semicolon-separated list for Mail, Outlook, Gmail BCC fields, etc. */
export function contactEmailsForMailApp(rows: ContactCsvRow[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const email = r.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(r.email!.trim());
  }
  return out.join("; ");
}

export function downloadContactsCsv(rows: ContactCsvRow[], filenamePrefix = "contacts"): void {
  const csv = contactsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
