/**
 * SITE-MEDIA-UPLOAD-01 — préparation des images du site public (logo, Hero,
 * visuels de modules, promotions) envoyées depuis /admin/site.
 *
 * Réutilise la validation serveur du Media System (lib/media/optimize.ts :
 * taille, décodage réel, dimensions, type binaire = type déclaré). Puis :
 *   - logo  : fichier original conservé tel quel (transparence PNG, netteté) ;
 *   - autres : une seule version WebP optimisée, 1920×1080 max, sans
 *     agrandissement (une image de site n'est jamais servie en original).
 *
 * Pas de `server-only` ici (même raison que optimize.ts) : testable par
 * `node --test`. L'écriture en stockage est faite par l'action serveur.
 */

import sharp from "sharp"
import {
  MEDIA_VARIANT_SPECS,
  validateImageBuffer,
  type AllowedMediaMimeType,
} from "./optimize"

export const SITE_IMAGE_SLOTS = ["logo", "hero", "module", "promo"] as const
export type SiteImageSlot = (typeof SITE_IMAGE_SLOTS)[number]

export function isSiteImageSlot(value: string): value is SiteImageSlot {
  return (SITE_IMAGE_SLOTS as readonly string[]).includes(value)
}

const MIME_TO_EXT: Record<AllowedMediaMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export interface PreparedSiteImage {
  buffer: Buffer
  contentType: AllowedMediaMimeType
  ext: string
  width: number
  height: number
}

export async function prepareSiteImage(
  buffer: Buffer,
  declaredMimeType: string,
  slot: SiteImageSlot,
): Promise<PreparedSiteImage> {
  const meta = await validateImageBuffer(buffer, declaredMimeType)

  if (slot === "logo") {
    return {
      buffer,
      contentType: meta.mimeType,
      ext: MIME_TO_EXT[meta.mimeType],
      width: meta.width,
      height: meta.height,
    }
  }

  const spec = MEDIA_VARIANT_SPECS.large
  const out = await sharp(buffer)
    .rotate()
    .resize(spec.width, spec.height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: spec.quality })
    .toBuffer()
  const outMeta = await sharp(out).metadata()
  return {
    buffer: out,
    contentType: "image/webp",
    ext: "webp",
    width: outMeta.width!,
    height: outMeta.height!,
  }
}

/** Clé de stockage unique par envoi : `site/<agence>/<emplacement>/<id>.<ext>`. */
export function siteImageKey(
  agencyId: string,
  slot: SiteImageSlot,
  id: string,
  ext: string,
): string {
  return `site/${agencyId}/${slot}/${id}.${ext}`
}

/** Messages lisibles pour l'administrateur (codes de MediaValidationError). */
export const SITE_IMAGE_ERROR_MESSAGES: Record<string, string> = {
  empty_file: "Fichier vide.",
  file_too_large: "Fichier trop lourd (20 Mo maximum).",
  unsupported_mime_type: "Format non accepté : JPEG, PNG ou WebP uniquement.",
  corrupt_image: "Image illisible ou corrompue.",
  mime_mismatch: "Le contenu du fichier ne correspond pas à son extension.",
  image_too_small: "Image trop petite (200 × 200 px minimum).",
  image_too_large_dimensions: "Image trop grande (8000 px maximum).",
}
