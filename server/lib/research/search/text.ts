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
