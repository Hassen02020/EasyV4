/**
 * Storage adapter — Media System (Mission Media, §2/§10/§30).
 *
 * Backend cible : Supabase Storage, bucket dédié `MEDIA_STORAGE_BUCKET`
 * (défaut "product-media"), clés `media/<agencyId>/<module>/<productId>/...`
 * (mission §2). Jamais de service role key exposée côté client — cet
 * adapter n'est importé que par du code serveur (server actions).
 *
 * `MEDIA_STORAGE_BACKEND=local` bascule vers un adapter filesystem local
 * (`.media-local/`, servi par app/api/media/[...key]/route.ts). Même
 * convention que MYGO_MODE=virtual / PAYMENT_MODE=virtual (.env.example) :
 * un flag EXPLICITE, jamais une détection automatique par sniff d'URL — ce
 * repo n'a pas de moyen fiable de distinguer un vrai projet Supabase d'un
 * mock à partir de l'URL seule (voir mock-gotrue, qui réutilise les mêmes
 * noms de variables d'env). Ce sandbox n'a pas de projet Supabase réel
 * (voir .env.local) : `MEDIA_STORAGE_BACKEND=local` y est donc explicite,
 * jamais un fallback silencieux qui masquerait un vrai échec Supabase en
 * production (mission §30 : documenter LOCAL/SUPABASE/PRODUCTION séparément
 * plutôt que prétendre avoir testé un environnement non testé).
 */

import "server-only"
import { createClient } from "@supabase/supabase-js"
import { promises as fs } from "fs"
import path from "path"

export type MediaStorageBackend = "supabase" | "local"

export interface MediaStorageAdapter {
  readonly backend: MediaStorageBackend
  /** Écrit (ou remplace) le contenu à `key`. Jamais appelé deux fois sur la même clé en usage normal (mission §11 : clés uniques par upload). */
  put(key: string, buffer: Buffer, contentType: string): Promise<void>
  /** Supprime les clés listées. Ignore silencieusement les clés déjà absentes (idempotent — utile pour le nettoyage sur erreur partielle, mission §20). */
  remove(keys: string[]): Promise<void>
  /** URL publique déterministe pour une clé — pas besoin de la stocker en base (mission §3 : seule la storageKey est en DB). */
  getPublicUrl(key: string): string
}

const MEDIA_BUCKET = process.env.MEDIA_STORAGE_BUCKET || "product-media"
const LOCAL_MEDIA_ROOT = path.join(process.cwd(), ".media-local")

/* -------------------------------------------------------------------------- */
/* Backend Supabase Storage                                                   */
/* -------------------------------------------------------------------------- */

function createSupabaseMediaStorage(): MediaStorageAdapter {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquant — requis pour MEDIA_STORAGE_BACKEND=supabase (défaut). " +
        "Pour tester en local sans projet Supabase réel, définir MEDIA_STORAGE_BACKEND=local.",
    )
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return {
    backend: "supabase",
    async put(key, buffer, contentType) {
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(key, buffer, {
        contentType,
        upsert: false,
      })
      if (error) {
        throw new Error(`[media-storage] échec upload Supabase Storage (${key}): ${error.message}`)
      }
    },
    async remove(keys) {
      if (keys.length === 0) return
      const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(keys)
      if (error) {
        throw new Error(`[media-storage] échec suppression Supabase Storage: ${error.message}`)
      }
    },
    getPublicUrl(key) {
      return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key).data.publicUrl
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Backend filesystem local (LOCAL TEST uniquement — voir en-tête de fichier) */
/* -------------------------------------------------------------------------- */

function createLocalMediaStorage(): MediaStorageAdapter {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ""

  return {
    backend: "local",
    async put(key, buffer, _contentType) {
      const filePath = path.join(LOCAL_MEDIA_ROOT, key)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, buffer)
    },
    async remove(keys) {
      await Promise.all(
        keys.map(async (key) => {
          const filePath = path.join(LOCAL_MEDIA_ROOT, key)
          await fs.rm(filePath, { force: true })
        }),
      )
    },
    getPublicUrl(key) {
      // Servi par app/api/media/[...key]/route.ts — chemin relatif, fonctionne
      // same-origin sans dépendre de NEXT_PUBLIC_SITE_URL en dev.
      return `${siteUrl}/api/media/${key}`
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Sélection du backend                                                       */
/* -------------------------------------------------------------------------- */

export function getMediaStorage(): MediaStorageAdapter {
  const backend = process.env.MEDIA_STORAGE_BACKEND === "local" ? "local" : "supabase"
  return backend === "local" ? createLocalMediaStorage() : createSupabaseMediaStorage()
}

export { LOCAL_MEDIA_ROOT, MEDIA_BUCKET }
