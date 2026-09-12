/**
 * HTML to readable text. Deliberately small and dependency-free: the research
 * pipeline needs sentences it can quote as evidence, not a DOM.
 *
 * Pure module — unit tested.
 */

const DROP_ELEMENTS =
  /<(script|style|noscript|svg|iframe|template|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi;

const BLOCK_ELEMENTS = /<\/?(p|div|section|article|h[1-6]|li|tr|br|hr|ul|ol|table)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "-",
  "&ndash;": "-",
  "&hellip;": "...",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
};

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(stripTags(match[1])).replace(/\s+/g, " ").trim();
  return title || null;
}

export function htmlToText(html: string, maxChars = 20_000): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(DROP_ELEMENTS, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ");

  const withBreaks = withoutHidden.replace(BLOCK_ELEMENTS, "\n");

  const text = decodeEntities(stripTags(withBreaks))
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text;
}

/**
 * Pulls the anchors out of a page so the crawler can follow "Team",
 * "Leadership", "Contact" style navigation. Absolute http(s) URLs only,
 * fragments stripped, deduplicated by URL; the label is the anchor's visible
 * text (or its aria-label/title when the anchor is an icon).
 */
export function extractLinks(
  html: string,
  baseUrl: string,
  max = 200,
): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);

  for (const match of anchors) {
    if (links.length >= max) break;
    const attrs = match[1] ?? "";
    const href = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const raw = (href?.[1] ?? href?.[2] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript):/i.test(raw)) continue;

    let url: URL;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";

    const key = url.toString().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const aria = attrs.match(/(?:aria-label|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const label = decodeEntities(stripTags(match[2] ?? ""))
      .replace(/\s+/g, " ")
      .trim()
      || (aria?.[1] ?? aria?.[2] ?? "").trim();

    links.push({ url: url.toString(), label: label.slice(0, 120) });
  }

  return links;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeEntities(value: string) {
  return value
    .replace(/&[a-z#0-9]+;/gi, (entity) => {
      const known = ENTITIES[entity.toLowerCase()];
      if (known) return known;
      const numeric = entity.match(/^&#(\d+);$/);
      if (numeric) return String.fromCodePoint(Number(numeric[1]));
      const hex = entity.match(/^&#x([0-9a-f]+);$/i);
      if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
      return entity;
    })
    .replace(/ /g, " ");
}
