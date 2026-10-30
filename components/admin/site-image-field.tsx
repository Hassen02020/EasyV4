"use client"

/**
 * SITE-MEDIA-UPLOAD-01 — champ image de /admin/site : envoi d'un fichier
 * (ou URL collée, toujours possible) + aperçu. Le fichier est envoyé par
 * `uploadSiteImage` ; l'URL publique retournée remplit le champ `name`, que
 * le formulaire parent enregistre avec son bouton « Enregistrer ».
 *
 * Limite Vercel : corps de requête ~4,5 Mo. Une photo plus lourde est
 * réduite dans le navigateur (2560 px max, WebP) avant l'envoi ; le serveur
 * revalide et optimise de toute façon. Un logo n'est jamais retouché ici.
 */

import { useRef, useState, useTransition } from "react"
import { uploadSiteImage } from "@/lib/admin/public-site-actions"
import type { SiteImageSlot } from "@/lib/media/site-image"

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp"

async function shrinkForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  )
  if (!blob) throw new Error("shrink_failed")
  return new File([blob], file.name.replace(/\.\w+$/, ".webp"), {
    type: "image/webp",
  })
}

export function SiteImageField({
  name,
  slot,
  defaultValue,
  label,
  required,
  onUrlChange,
}: {
  name: string
  slot: SiteImageSlot
  defaultValue?: string | null
  label: string
  required?: boolean
  /** Formulaire contrôlé (ex. /admin/brand) : reçoit chaque nouvelle URL. */
  onUrlChange?: (url: string) => void
}) {
  const [url, setUrlState] = useState(defaultValue ?? "")
  function setUrl(next: string) {
    setUrlState(next)
    onUrlChange?.(next)
  }
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setDone(false)
    startTransition(async () => {
      let toSend = file
      if (file.size > MAX_UPLOAD_BYTES) {
        if (slot === "logo") {
          setError("Logo trop lourd (4 Mo maximum).")
          return
        }
        try {
          toSend = await shrinkForUpload(file)
        } catch {
          setError("Image illisible.")
          return
        }
        if (toSend.size > MAX_UPLOAD_BYTES) {
          setError("Image trop lourde même après réduction.")
          return
        }
      }
      const fd = new FormData()
      fd.set("slot", slot)
      fd.set("file", toSend)
      const result = await uploadSiteImage(fd)
      if (result.ok) {
        setUrl(result.url)
        setDone(true)
      } else {
        setError(result.error)
      }
      if (fileRef.current) fileRef.current.value = ""
    })
  }

  return (
    <div className="space-y-1 text-sm">
      <span>{label}</span>
      <div className="flex items-start gap-3">
        <div
          className={`border-border bg-muted flex shrink-0 items-center justify-center overflow-hidden rounded-md border ${
            slot === "logo" ? "h-14 w-14" : "h-14 w-24"
          }`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className={`h-full w-full ${slot === "logo" ? "object-contain" : "object-cover"}`}
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
              disabled={pending}
              className="border-border bg-background hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {pending ? "Envoi en cours…" : "Choisir une image"}
            </button>
            <span className="text-muted-foreground text-xs">
              JPEG, PNG ou WebP
              {slot === "logo" ? " · PNG transparent conseillé" : ""}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          <input
            name={name}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setDone(false)
            }}
            required={required}
            placeholder="https://… (ou choisissez une image)"
            className="border-border bg-background w-full rounded-md border px-3 py-2"
          />
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : done ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Image envoyée — cliquez sur « Enregistrer » pour la publier.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
