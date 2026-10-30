/**
 * SITE-VIDEO-01 — vidéo Hero du site public (/admin/site).
 *
 * Une vidéo dépasse la limite de corps de requête Vercel (~4,5 Mo) : elle
 * est envoyée DIRECTEMENT par le navigateur vers Supabase Storage via une
 * URL d'envoi signée à usage unique, émise par une action serveur gardée.
 * Ensuite, le serveur relit les premiers octets du fichier et vérifie sa
 * signature binaire (MP4 « ftyp », WebM EBML) : un fichier qui n'est pas
 * réellement une vidéo est supprimé, jamais publié.
 *
 * Pas de `server-only` : testable par `node --test`.
 */

export const SITE_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const
export type SiteVideoMimeType = (typeof SITE_VIDEO_MIME_TYPES)[number]

/** Aligné sur file_size_limit du compartiment (migration 0146). */
export const MAX_SITE_VIDEO_BYTES = 50 * 1024 * 1024

const EXT: Record<SiteVideoMimeType, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
}

export function isSiteVideoMimeType(value: string): value is SiteVideoMimeType {
  return (SITE_VIDEO_MIME_TYPES as readonly string[]).includes(value)
}

export type SiteVideoRequestError =
  | "unsupported_video_type"
  | "video_too_large"
  | "empty_video"

export function validateSiteVideoRequest(input: {
  contentType: string
  size: number
}): SiteVideoRequestError | null {
  if (!isSiteVideoMimeType(input.contentType)) return "unsupported_video_type"
  if (!Number.isFinite(input.size) || input.size <= 0) return "empty_video"
  if (input.size > MAX_SITE_VIDEO_BYTES) return "video_too_large"
  return null
}

/** Clé de stockage : `site/<agence>/hero-video/<id>.<ext>`. */
export function siteVideoKey(
  agencyId: string,
  id: string,
  mime: SiteVideoMimeType,
): string {
  return `site/${agencyId}/hero-video/${id}.${EXT[mime]}`
}

/** La clé appartient-elle bien à cette agence et à l'emplacement vidéo ? */
export function isOwnSiteVideoKey(agencyId: string, key: string): boolean {
  return new RegExp(
    `^site/${agencyId}/hero-video/[0-9a-f-]{36}\\.(mp4|webm)$`,
  ).test(key)
}

/**
 * Signature binaire réelle : MP4/MOV (ISO BMFF) = « ftyp » aux octets 4-7 ;
 * WebM = en-tête EBML 1A 45 DF A3. Le type déclaré doit correspondre.
 */
export function hasVideoSignature(
  head: Uint8Array,
  mime: SiteVideoMimeType,
): boolean {
  if (mime === "video/mp4") {
    return (
      head.length >= 8 &&
      head[4] === 0x66 && // f
      head[5] === 0x74 && // t
      head[6] === 0x79 && // y
      head[7] === 0x70 // p
    )
  }
  return (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  )
}

export function mimeFromSiteVideoKey(key: string): SiteVideoMimeType | null {
  if (key.endsWith(".mp4")) return "video/mp4"
  if (key.endsWith(".webm")) return "video/webm"
  return null
}

export const SITE_VIDEO_ERROR_MESSAGES: Record<string, string> = {
  unsupported_video_type: "Format non accepté : MP4 ou WebM uniquement.",
  video_too_large: "Vidéo trop lourde (50 Mo maximum).",
  empty_video: "Fichier vide.",
  not_a_video: "Le fichier envoyé n'est pas une vidéo MP4/WebM valide.",
}
