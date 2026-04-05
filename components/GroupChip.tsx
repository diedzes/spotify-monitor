"use client";

import Link from "next/link";
import { normalizeGroupColor } from "@/lib/group-color";

type Props = {
  name: string;
  color?: string | null;
  href?: string;
  className?: string;
  /** Hitlist-bron groep (isMainGroup) — extra accent en titel. */
  isHitlistMainGroup?: boolean;
};

export function GroupChip({ name, color, href, className = "", isHitlistMainGroup }: Props) {
  const c = normalizeGroupColor(color);
  const inner = (
    <span
      title={isHitlistMainGroup ? "Hitlist-hoofdgroep (bron voor vergelijking)" : undefined}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ring-1 ${
        isHitlistMainGroup
          ? "border-emerald-300/90 bg-emerald-50 text-emerald-950 ring-emerald-500/25 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-500/20"
          : "border-zinc-200/90 bg-zinc-50 text-zinc-800 ring-black/[0.04] dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-white/10"
      } ${className}`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ backgroundColor: c }} aria-hidden />
      <span className="min-w-0 truncate">{name}</span>
      {isHitlistMainGroup ? (
        <span className="shrink-0 rounded bg-emerald-600/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
          Hitlist
        </span>
      ) : null}
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
