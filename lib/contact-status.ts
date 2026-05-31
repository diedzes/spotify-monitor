export const CONTACT_STATUSES = [
  "warm",
  "do_not_contact",
  "no_recent_contact",
  "cold",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  warm: "Warm Contact",
  do_not_contact: "Do Not Contact",
  no_recent_contact: "No Recent Contact",
  cold: "Cold Contact",
};

export const CONTACT_STATUS_STYLES: Record<ContactStatus, string> = {
  warm: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  do_not_contact: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
  no_recent_contact: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  cold: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
};

/** Sort order for status column (warm first, do-not-contact last). */
export const CONTACT_STATUS_SORT_ORDER: Record<ContactStatus, number> = {
  warm: 0,
  no_recent_contact: 1,
  cold: 2,
  do_not_contact: 3,
};

export function parseContactStatus(value: string | null | undefined): ContactStatus | null {
  if (!value) return null;
  return CONTACT_STATUSES.includes(value as ContactStatus) ? (value as ContactStatus) : null;
}

export function contactStatusLabel(status: ContactStatus | null | undefined): string {
  if (!status) return "—";
  return CONTACT_STATUS_LABELS[status];
}
