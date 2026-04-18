/**
 * Lightweight Open Graph / Twitter Card fetch for link previews (X, TikTok, etc.).
 * Best-effort: many sites block scrapers; failures return null fields.
 */

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pickMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function resolveUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}

export type OgPreview = {
  title: string | null;
  image: string | null;
  siteName: string | null;
};

export async function fetchOpenGraphPreview(urlString: string): Promise<OgPreview> {
  let url: URL;
  try {
    url = new URL(urlString.trim());
  } catch {
    return { title: null, image: null, siteName: null };
  }
  if (!/^https?:$/i.test(url.protocol)) {
    return { title: null, image: null, siteName: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; SportSoundsTrackReport/1.0; +https://sport-sounds.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { title: null, image: null, siteName: null };
    const html = await res.text();

    const title = pickMeta(html, [
      /property=["']og:title["']\s+content=["']([^"']*)["']/i,
      /name=["']twitter:title["']\s+content=["']([^"']*)["']/i,
      /<title[^>]*>([^<]*)<\/title>/i,
    ]);

    let image =
      pickMeta(html, [
        /property=["']og:image["']\s+content=["']([^"']*)["']/i,
        /name=["']twitter:image["']\s+content=["']([^"']*)["']/i,
        /name=["']twitter:image:src["']\s+content=["']([^"']*)["']/i,
      ]) ?? null;
    if (image) {
      const abs = resolveUrl(res.url, image);
      if (abs) image = abs;
    }

    const siteName =
      pickMeta(html, [
        /property=["']og:site_name["']\s+content=["']([^"']*)["']/i,
        /name=["']application-name["']\s+content=["']([^"']*)["']/i,
      ]) ?? url.hostname.replace(/^www\./, "");

    return { title, image, siteName: siteName || null };
  } catch {
    clearTimeout(timer);
    return { title: null, image: null, siteName: null };
  }
}
