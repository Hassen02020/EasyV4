"use client"

/**
 * SITE-VIDEO-01 — champ « Vidéo Hero » de /admin/site.
 *
 * 1. `createSiteVideoUpload` émet une URL d'envoi signée (action gardée) ;
 * 2. le navigateur envoie le fichier DIRECTEMENT au stockage (PUT, avec
 *    une vraie progression XHR) — une vidéo dépasse la limite Vercel ;
 * 3. `confirmSiteVideoUpload` vérifie la signature binaire côté serveur et
 *    renvoie l'URL publique, que le formulaire parent enregistre.
 */

import { useRef, useState } from "react"
import {
  confirmSiteVideoUpload,
  createSiteVideoUpload,
} from "@/lib/admin/public-site-actions"
import {
  MAX_SITE_VIDEO_BYTES,
  SITE_VIDEO_ERROR_MESSAGES,
  validateSiteVideoRequest,
} from "@/lib/media/site-video"

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.setRequestHeader("x-upsert", "false")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error("network"))
    xhr.send(file)
  })
}

export function SiteVideoField({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue?: string | null
}) {
  const [url, setUrl] = useState(defaultValue ?? "")
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = progress !== null

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setDone(false)
    const invalid = validateSiteVideoRequest({
      contentType: file.type,
      size: file.size,
    })
    if (invalid) {
      setError(SITE_VIDEO_ERROR_MESSAGES[invalid])
      return
    }
    setProgress(0)
    try {
      const prepared = await createSiteVideoUpload({
        contentType: file.type,
        size: file.size,
      })
      if (!prepared.ok) {
        setError(prepared.error)
        return
      }
      await putWithProgress(prepared.uploadUrl, file, setProgress)
      const confirmed = await confirmSiteVideoUpload(prepared.key)
      if (!confirmed.ok) {
        setError(confirmed.error)
        return
      }
      setUrl(confirmed.url)
      setDone(true)
    } catch {
      setError("Échec de l'envoi de la vidéo. Réessayez.")
    } finally {
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-1 text-sm">
      <span>{label}</span>
      <div className="flex flex-wrap items-start gap-3">
        <div className="border-border bg-muted flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border">
          {url ? (
            <video
              src={url}
              muted
              playsInline
              loop
              autoPlay
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-muted-foreground text-xs">Aucune</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="border-border bg-background hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {busy ? `Envoi… ${progress} %` : "Choisir une vidéo"}
            </button>
            {url ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setUrl("")
                  setDone(false)
                }}
                className="text-muted-foreground text-xs underline"
              >
                Retirer
              </button>
            ) : null}
            <span className="text-muted-foreground text-xs">
              MP4 ou WebM, {MAX_SITE_VIDEO_BYTES / 1024 / 1024} Mo max ·
              conseillé : 10-20 s, sans son, 1920 px
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          {busy ? (
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
          <input type="hidden" name={name} value={url} />
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : done ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Vidéo envoyée et vérifiée — cliquez sur « Enregistrer » pour la
              publier.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Lue en boucle, sans son, derrière le moteur de recherche de
              l&apos;accueil (ordinateur et tablette). Sur mobile et si
              l&apos;utilisateur a demandé à réduire les animations,
              l&apos;image Hero s&apos;affiche à la place.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
