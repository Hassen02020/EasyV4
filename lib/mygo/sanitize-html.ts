/**
 * Sanitize HTML strings returned by myGo API descriptions.
 *
 * myGo descriptions often arrive double-encoded:
 *   `&lt;span style="..."&gt;Cet h&amp;ocirc;tel 4 &amp;eacute;toiles...&lt;/span&gt;`
 *
 * After full decoding we get:
 *   `<span style="...">Cet hôtel 4 étoiles...</span>`
 *
 * We then strip the remaining tags to keep just the readable text.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  // accents fr / common HTML4 entities
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  aelig: "æ",
  AElig: "Æ",
  ccedil: "ç",
  Ccedil: "Ç",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  Egrave: "È",
  ecirc: "ê",
  Ecirc: "Ê",
  euml: "ë",
  Euml: "Ë",
  iuml: "ï",
  Iuml: "Ï",
  icirc: "î",
  Icirc: "Î",
  ocirc: "ô",
  Ocirc: "Ô",
  oelig: "œ",
  OElig: "Œ",
  ouml: "ö",
  Ouml: "Ö",
  ugrave: "ù",
  Ugrave: "Ù",
  ucirc: "û",
  Ucirc: "Û",
  uuml: "ü",
  Uuml: "Ü",
  yuml: "ÿ",
  // punctuation / symbols
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  euro: "€",
}

function decodeEntitiesOnce(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16)
      if (Number.isFinite(code)) return String.fromCodePoint(code)
      return match
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10)
      if (Number.isFinite(code)) return String.fromCodePoint(code)
      return match
    }
    const replacement = NAMED_ENTITIES[body]
    return replacement ?? match
  })
}

/** Decode HTML entities until stable (handles double encoding). */
function decodeEntities(input: string): string {
  let prev = input
  for (let i = 0; i < 4; i++) {
    const next = decodeEntitiesOnce(prev)
    if (next === prev) return next
    prev = next
  }
  return prev
}

/** Strip HTML tags (script/style content removed wholesale). */
function stripTags(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
}

/** Collapse repeated whitespace, trim. */
function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Decode + strip + normalize a (possibly double-encoded) HTML string into
 * clean plain text suitable for rendering with `whitespace-pre-line`.
 */
export function sanitizeHtmlToText(input: string | null | undefined): string {
  if (!input) return ""
  return normalizeWhitespace(stripTags(decodeEntities(input)))
}
