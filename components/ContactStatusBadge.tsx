import {
  contactStatusLabel,
  CONTACT_STATUS_STYLES,
  type ContactStatus,
} from "@/lib/contact-status";

type Props = {
  status: ContactStatus | null | undefined;
  className?: string;
};

export function ContactStatusBadge({ status, className = "" }: Props) {
  if (!status) {
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-zinc-500 ${className}`}>
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CONTACT_STATUS_STYLES[status]} ${className}`}
    >
      {contactStatusLabel(status)}
    </span>
  );
}
