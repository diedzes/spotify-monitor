/**
 * Extraheert een Spotify user id uit profiel-URL of ruwe invoer.
 * Ondersteunt o.a. locale-paden (intl-xx) op open.spotify.com.
 */

function tryDecodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Geeft het Spotify user id terug, of null bij ongeldige invoer.
 */
export function extractSpotifyUserIdFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase().startsWith("spotify:user:")) {
    const rest = trimmed.slice("spotify:user:".length);
    const id = rest.split(":")[0]?.trim();
    return id ? tryDecodePathSegment(id) : null;
  }

  const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(href);
    if (/open\.spotify\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/\/user\/([^/]+)/);
      if (m?.[1]) return tryDecodePathSegment(m[1]);
    }
  } catch {
    // geen URL
  }

  // Losse user id
  if (/^[a-zA-Z0-9._-]+$/.test(trimmed) && trimmed.length <= 128) {
    return trimmed;
  }

  return null;
}
