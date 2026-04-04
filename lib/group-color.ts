/** Default for groups without a stored color (matches DB default). */
export const DEFAULT_GROUP_COLOR = "#71717a";

/** Curated presets for pickers (hex #RRGGBB). */
export const GROUP_COLOR_PRESETS = [
  "#1DB954",
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#71717a",
] as const;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** Normalize user/API input to a safe #rrggbb or fall back to default. */
export function normalizeGroupColor(input: string | null | undefined): string {
  if (input == null || typeof input !== "string") return DEFAULT_GROUP_COLOR;
  const t = input.trim();
  if (HEX6.test(t)) return t.toLowerCase();
  const bare = t.replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(bare)) return `#${bare.toLowerCase()}`;
  return DEFAULT_GROUP_COLOR;
}
