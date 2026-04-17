"use client";

import Link from "next/link";

type Props = {
  backHref: string;
};

export function TrackClientReportToolbar({ backHref }: Props) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link href={backHref} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        ← Back
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-[#1DB954] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1ed760]"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
