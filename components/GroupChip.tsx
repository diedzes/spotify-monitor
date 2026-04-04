"use client";

import Link from "next/link";
import { normalizeGroupColor } from "@/lib/group-color";

type Props = {
  name: string;
  color?: string | null;
  href?: string;
  className?: string;
};

export function GroupChip({ name, color, href, className = "" }: Props) {
  const c = normalizeGroupColor(color);
  const inner = (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200/90 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-800 ring-1 ring-black/[0.04] dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-white/10 ${className}`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ backgroundColor: c }} aria-hidden />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex max-w-full min-w-0 hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return inner;
}
