/**
 * SITE-BRAND-THEME-01 — couleur d'accent de marque appliquée au site.
 *
 * La couleur (`agencies.primary_color`, saisie dans /admin/brand ou par une
 * agence White Label) remplace `--primary`. Le texte posé dessus
 * (`--primary-foreground` : boutons, badges) est choisi automatiquement
 * entre blanc et bleu nuit selon le meilleur contraste WCAG 2.x : une
 * couleur claire ne rend jamais le texte des boutons illisible.
 *
 * Pas de `server-only` : utilisé aussi par le formulaire /admin/brand
 * (aperçu du contraste) et testé par `node --test`.
 */

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

export const ON_BRAND_LIGHT = "#ffffff"
export const ON_BRAND_DARK = "#13233f"

/** Seuil WCAG AA pour du texte normal. */
export const WCAG_AA_NORMAL = 4.5

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  )
  return (hi + 0.05) / (lo + 0.05)
}

/** Couleur de texte la plus lisible sur la couleur de marque, et son contraste. */
export function onBrandColor(hex: string): { color: string; ratio: number } {
  const light = contrastRatio(hex, ON_BRAND_LIGHT)
  const dark = contrastRatio(hex, ON_BRAND_DARK)
  return light >= dark
    ? { color: ON_BRAND_LIGHT, ratio: light }
    : { color: ON_BRAND_DARK, ratio: dark }
}

/**
 * Variables CSS à poser sur <html>, ou `null` (couleur absente ou invalide →
 * teinte Easy2Book par défaut de globals.css). Revalidée ici : la valeur
 * vient de la base et atterrit dans un attribut `style`.
 */
export function brandColorVars(
  hex: string | null | undefined,
): Record<"--primary" | "--primary-foreground", string> | null {
  if (!hex || !HEX_COLOR_REGEX.test(hex)) return null
  return {
    "--primary": hex.toLowerCase(),
    "--primary-foreground": onBrandColor(hex).color,
  }
}
