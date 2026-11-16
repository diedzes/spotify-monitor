"use client";

import { STADIUM_MOMENTS, STADIUM_PROOFS } from "@/lib/stadium-play-options";

/**
 * The two extra questions for a stadium play (2026-11-16): when in the match
 * the track was played, and how we know. Both optional; used by the new-entry
 * form and the edit dialog.
 */
export function StadiumMomentProofFields({
  moment,
  proof,
  onMoment,
  onProof,
}: {
  moment: string;
  proof: string;
  onMoment: (value: string) => void;
  onProof: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Moment in the match
        <select value={moment} onChange={(e) => onMoment(e.target.value)} className="w-full rounded border px-2 py-2 text-sm text-zinc-900">
          <option value="">Not recorded</option>
          {STADIUM_MOMENTS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        How do we know?
        <select value={proof} onChange={(e) => onProof(e.target.value)} className="w-full rounded border px-2 py-2 text-sm text-zinc-900">
          <option value="">Not recorded</option>
          {STADIUM_PROOFS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
