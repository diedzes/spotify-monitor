/**
 * Stadium plays (2026-11-16): the moment in the match and the level of proof.
 * Stored as text in feedback_entries.stadiumMoment / stadiumProof; an unknown
 * or empty value is stored as null. Shared by the forms, the API and the
 * integration endpoint, so the list lives in one place.
 */
export const STADIUM_MOMENTS = [
  { value: "warmup", label: "Warm-up" },
  { value: "walkout", label: "Walk-out" },
  { value: "lineup", label: "Line-up announcement" },
  { value: "goal", label: "Goal tune" },
  { value: "halftime", label: "Half-time" },
  { value: "win", label: "After a win" },
  { value: "fulltime", label: "After the final whistle" },
  { value: "other", label: "Other moment" },
] as const;

/**
 * How we know the track was played, weakest first:
 * - reported: someone told us, not the person who played it.
 * - confirmed: the stadium DJ or the club confirmed it themselves.
 * - documented: there is a clip, a set list or a public post (the evidence link).
 * - detected: the stadium scanner recognised the track in a recording.
 */
export const STADIUM_PROOFS = [
  { value: "reported", label: "Reported by someone else" },
  { value: "confirmed", label: "Confirmed by the DJ or club" },
  { value: "documented", label: "Documented: clip, set list or post" },
  { value: "detected", label: "Detected by the stadium scanner" },
] as const;

export type StadiumMoment = (typeof STADIUM_MOMENTS)[number]["value"];
export type StadiumProof = (typeof STADIUM_PROOFS)[number]["value"];

export function parseStadiumMoment(raw: string | null | undefined): StadiumMoment | null {
  return STADIUM_MOMENTS.find((m) => m.value === raw)?.value ?? null;
}

export function parseStadiumProof(raw: string | null | undefined): StadiumProof | null {
  return STADIUM_PROOFS.find((p) => p.value === raw)?.value ?? null;
}

export const stadiumMomentLabel = (raw: string | null | undefined): string | null => STADIUM_MOMENTS.find((m) => m.value === raw)?.label ?? null;
export const stadiumProofLabel = (raw: string | null | undefined): string | null => STADIUM_PROOFS.find((p) => p.value === raw)?.label ?? null;
