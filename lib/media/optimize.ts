/**
 * Pipeline d'optimisation image — Media System (mission §6/§7/§9/§12/§13).
 *
 * Validation SERVEUR (jamais confiance dans ce que le navigateur déclare,
 * mission §9) + génération des variantes physiques stockées en Storage
 * (mission §6A/B) :
 *   - original  : bytes tels qu'uploadés, AUCUN traitement (préserve la
 *                 qualité commerciale — mission §5/§13). Les navigateurs
 *                 respectent nativement l'orientation EXIF à l'affichage,
 *                 donc pas besoin de la corriger ici.
 *   - large     : hero / page détail / galerie plein écran
 *   - medium    : contenu secondaire
 *   - card      : cartes produit / résultats de recherche
 *   - thumbnail : miniatures galerie / gestion admin
 *
 * Dimensions "card" DÉRIVÉES d'un usage réel vérifié dans le repo (pas
 * choisies au hasard, mission §6/§33) :
 *   - components/packages/package-list.tsx:20 → conteneur `h-44` (176px),
 *     `sizes="(max-width: 768px) 100vw, 33vw"`
 *   - app/attractions/page.tsx:109 → conteneur `h-40` (160px), même `sizes`
 *   - Grille `md:grid-cols-2 lg:grid-cols-3` dans les deux cas.
 *   Pire cas retina : 33vw d'un viewport desktop large (~1920px) × DPR 2
 *   ≈ 634px ; 100vw mobile (~430px) × DPR 3 ≈ 1290px. 640×360 (16:9) est un
 *   compromis délibéré : couvre le cas desktop quasi exactement et reste
 *   très inférieur à un original haute résolution (mission §29 : jamais
 *   télécharger l'original pour une carte), le mobile bénéficiant de toute
 *   façon du redimensionnement navigateur sur une image déjà optimisée.
 *
 * `large`/`medium`/`thumbnail` n'ont PAS d'équivalent existant à inspecter
 * (page détail + galerie produit sont construites par cette même mission,
 * §264) : valeurs standard raisonnables (hero 1920px, contenu secondaire
 * 1024px, miniature 240px carrée), documentées comme telles plutôt que
 * présentées comme dérivées d'un composant réel — voir
 * docs/architecture/media-system.md.
 *
 * Pas de marqueur `import "server-only"` ici (contrairement à
 * lib/media/storage.ts) : ce module ne porte aucun secret, et `sharp` est
 * un module natif Node qui ne peut de toute façon pas être bundlé côté
 * client. L'absence du marqueur permet aussi de le tester directement via
 * `node --test` (lib/media/__tests__/optimize.test.ts) — `server-only`
 * lève une exception dès qu'il est importé hors du bundler Next.js, y
 * compris dans un test Node classique.
 */

import sharp, { type Metadata } from "sharp"

export type MediaVariantName = "large" | "medium" | "card" | "thumbnail"

interface VariantSpec {
  width: number
  height: number
  fit: "inside" | "cover"
  quality: number
}

export const MEDIA_VARIANT_SPECS: Record<MediaVariantName, VariantSpec> = {
  large: { width: 1920, height: 1080, fit: "inside", quality: 82 },
  medium: { width: 1024, height: 576, fit: "inside", quality: 80 },
  card: { width: 640, height: 360, fit: "cover", quality: 78 },
  thumbnail: { width: 240, height: 240, fit: "cover", quality: 75 },
}

/** JPEG/PNG/WebP en priorité (mission §5) — fiabilité avant tout, pas d'AVIF en entrée pour l'instant (décodage fiable mais écosystème d'édition/partage encore inégal côté admin). */
export const ALLOWED_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number]

const SHARP_FORMAT_TO_MIME: Record<string, AllowedMediaMimeType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

/** ~15-25MB par la mission §5 ; 20MB retenu comme plafond serveur concret. */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
/** En-dessous, ce n'est pas une "photo haute résolution" commerciale exploitable (mission §5/§13). */
export const MIN_DIMENSION_PX = 200
/** Protection anti bombe de décompression — pas une limite commerciale réelle. */
export const MAX_DIMENSION_PX = 8000

export type MediaValidationErrorCode =
  | "empty_file"
  | "file_too_large"
  | "unsupported_mime_type"
  | "corrupt_image"
  | "mime_mismatch"
  | "image_too_small"
  | "image_too_large_dimensions"

export class MediaValidationError extends Error {
  constructor(public readonly code: MediaValidationErrorCode) {
    super(`media_validation_failed:${code}`)
    this.name = "MediaValidationError"
  }
}

export interface ValidatedImageMeta {
  width: number
  height: number
  mimeType: AllowedMediaMimeType
}

/**
 * Validation serveur complète (mission §9 : jamais confiance dans le
 * navigateur). Vérifie taille, décodabilité réelle, dimensions, ET que le
 * contenu binaire correspond VRAIMENT au mimeType déclaré (un .jpg renommé
 * en .png, ou un fichier non-image avec une extension trompeuse, échoue
 * ici même si la validation client l'a laissé passer).
 */
export async function validateImageBuffer(
  buffer: Buffer,
  declaredMimeType: string,
): Promise<ValidatedImageMeta> {
  if (buffer.byteLength === 0) throw new MediaValidationError("empty_file")
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) throw new MediaValidationError("file_too_large")
  if (!(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(declaredMimeType)) {
    throw new MediaValidationError("unsupported_mime_type")
  }

  let metadata: Metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw new MediaValidationError("corrupt_image")
  }

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new MediaValidationError("corrupt_image")
  }
  if (metadata.width < MIN_DIMENSION_PX || metadata.height < MIN_DIMENSION_PX) {
    throw new MediaValidationError("image_too_small")
  }
  if (metadata.width > MAX_DIMENSION_PX || metadata.height > MAX_DIMENSION_PX) {
    throw new MediaValidationError("image_too_large_dimensions")
  }

  const sniffedMime = SHARP_FORMAT_TO_MIME[metadata.format]
  if (!sniffedMime || sniffedMime !== declaredMimeType) {
    throw new MediaValidationError("mime_mismatch")
  }

  return { width: metadata.width, height: metadata.height, mimeType: sniffedMime }
}

export interface GeneratedVariant {
  buffer: Buffer
  width: number
  height: number
}

/**
 * Génère les 4 variantes optimisées (WebP) à partir d'un buffer déjà validé
 * par `validateImageBuffer`. L'original n'est PAS produit ici — il reste les
 * bytes uploadés tels quels (voir en-tête de fichier).
 */
export async function generateMediaVariants(
  buffer: Buffer,
): Promise<Record<MediaVariantName, GeneratedVariant>> {
  const entries = await Promise.all(
    (Object.entries(MEDIA_VARIANT_SPECS) as [MediaVariantName, VariantSpec][]).map(
      async ([name, spec]) => {
        const outBuffer = await sharp(buffer)
          .rotate() // auto-oriente selon l'EXIF avant redimensionnement (source ne sera plus affichée telle quelle ensuite)
          .resize(spec.width, spec.height, {
            fit: spec.fit,
            withoutEnlargement: spec.fit === "inside",
          })
          .webp({ quality: spec.quality })
          .toBuffer()
        const outMeta = await sharp(outBuffer).metadata()
        return [
          name,
          { buffer: outBuffer, width: outMeta.width!, height: outMeta.height! },
        ] as const
      },
    ),
  )
  return Object.fromEntries(entries) as Record<MediaVariantName, GeneratedVariant>
}
