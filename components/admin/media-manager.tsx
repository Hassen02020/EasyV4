"use client"

/**
 * MediaManager — Media System (mission §14), commun à Omraty / Voyages
 * Organisés / Attractions (mission §1/§38 : même composant pour les 3
 * modules, aucune duplication).
 *
 * Composant "contrôlé" par `initialMedia` (fourni par le Server Component
 * parent, déjà résolu en URLs publiques via getMediaStorage().getPublicUrl —
 * lib/media/storage.ts est server-only, jamais importé ici). Après chaque
 * mutation réussie (upload/suppression/réorganisation/couverture/
 * remplacement), `router.refresh()` redemande au parent une liste à jour —
 * même pattern que `OmraAllotmentManager` (components/admin/
 * omra-allotment-manager.tsx), pas une invention pour ce composant.
 *
 * Pas de bibliothèque drag-and-drop externe (aucune déjà présente dans le
 * repo) : réordonnancement par boutons haut/bas, accessible au clavier et
 * sur mobile — plus fiable qu'un drag-and-drop tactile maison, et cohérent
 * avec la règle mission §16 "doit fonctionner SANS drag & drop" appliquée
 * ici aussi à la réorganisation, pas seulement à l'upload.
 *
 * Barre de progression : les Server Actions Next.js n'exposent aucun
 * événement de progression par octet (contrairement à XHR) — afficher un
 * pourcentage serait fabriqué. `UploadProgress` montre donc un état réel
 * (en cours / réussi / échec) plutôt qu'un pourcentage inventé.
 */

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Upload,
  ImageIcon,
  Star,
  Trash2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import {
  uploadProductMedia,
  deleteProductMedia,
  reorderProductMedia,
  setCoverProductMedia,
  replaceProductMedia,
} from "@/lib/admin/product-media-actions"
import { ConfirmActionDialog } from "./confirm-action-dialog"

export interface MediaManagerItem {
  id: string
  /** URL publique de la variante "card" — la plus adaptée à une vignette de gestion (mission §12). */
  cardUrl: string
  thumbnailUrl: string
  originalFilename: string
  altText: string | null
  sortOrder: number
  isCover: boolean
}

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp"
/** Même plafond que lib/media/optimize.ts::MAX_FILE_SIZE_BYTES — validation client rapide, revalidée serveur de toute façon (mission §9). */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

interface PendingUpload {
  key: string
  file: File
  previewUrl: string
  status: "uploading" | "success" | "error"
  error?: string
}

export function MediaManager({
  module,
  productId,
  initialMedia,
}: {
  module: "omra" | "package" | "activity"
  productId: string
  initialMedia: MediaManagerItem[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const media = [...initialMedia].sort((a, b) => a.sortOrder - b.sortOrder)

  /* ------------------------------------------------------------------ */
  /* Upload (multiple, mission §15 : un échec n'annule pas les autres)  */
  /* ------------------------------------------------------------------ */

  function validateClientSide(file: File): string | null {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) return "Format non supporté (JPG, PNG ou WebP uniquement)"
    if (file.size > MAX_FILE_SIZE_BYTES) return "Fichier trop volumineux (20MB max)"
    return null
  }

  async function uploadOne(pending: PendingUpload) {
    const clientError = validateClientSide(pending.file)
    if (clientError) {
      setPendingUploads((prev) => prev.map((p) => (p.key === pending.key ? { ...p, status: "error", error: clientError } : p)))
      return
    }

    const formData = new FormData()
    formData.set("module", module)
    formData.set("productId", productId)
    formData.set("file", pending.file)

    const result = await uploadProductMedia(formData)
    if (!result.ok) {
      setPendingUploads((prev) => prev.map((p) => (p.key === pending.key ? { ...p, status: "error", error: result.error } : p)))
      return
    }
    setPendingUploads((prev) => prev.map((p) => (p.key === pending.key ? { ...p, status: "success" } : p)))
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const newPending: PendingUpload[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "uploading",
    }))
    setPendingUploads((prev) => [...prev, ...newPending])

    Promise.allSettled(newPending.map((p) => uploadOne(p))).then(() => {
      router.refresh()
    })
  }

  function retryUpload(key: string) {
    const target = pendingUploads.find((p) => p.key === key)
    if (!target) return
    setPendingUploads((prev) => prev.map((p) => (p.key === key ? { ...p, status: "uploading", error: undefined } : p)))
    uploadOne(target).then(() => router.refresh())
  }

  function dismissUpload(key: string) {
    setPendingUploads((prev) => {
      const target = prev.find((p) => p.key === key)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.key !== key)
    })
  }

  /* ------------------------------------------------------------------ */
  /* Drag & drop desktop (jamais obligatoire, mission §16)              */
  /* ------------------------------------------------------------------ */

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    handleFilesSelected(e.dataTransfer.files)
  }

  /* ------------------------------------------------------------------ */
  /* Suppression / couverture / réorganisation / remplacement           */
  /* ------------------------------------------------------------------ */

  function handleDelete(mediaId: string) {
    startTransition(async () => {
      const result = await deleteProductMedia(mediaId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Photo supprimée.")
      router.refresh()
    })
  }

  function handleSetCover(mediaId: string) {
    startTransition(async () => {
      const result = await setCoverProductMedia(mediaId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= media.length) return
    const reordered = [...media]
    ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
    const orderedIds = reordered.map((m) => m.id)
    startTransition(async () => {
      const result = await reorderProductMedia(module, productId, orderedIds)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleReplaceClick(mediaId: string) {
    setReplacingId(mediaId)
    replaceInputRef.current?.click()
  }

  function handleReplaceFileChosen(file: File | undefined) {
    if (!file || !replacingId) {
      setReplacingId(null)
      return
    }
    const clientError = validateClientSide(file)
    if (clientError) {
      toast.error(clientError)
      setReplacingId(null)
      return
    }
    const mediaId = replacingId
    const formData = new FormData()
    formData.set("file", file)
    startTransition(async () => {
      const result = await replaceProductMedia(mediaId, formData)
      setReplacingId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Photo remplacée.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* UploadZone : drag & drop desktop + clic (fonctionne aussi sur mobile, où le clic ouvre le sélecteur natif) */}
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload className="text-muted-foreground mx-auto mb-2 size-8" />
        <p className="text-muted-foreground mb-3 text-sm">
          Glissez-déposez des photos ici, ou
        </p>
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          Ajouter des photos
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files)
            e.target.value = ""
          }}
        />
        <p className="text-muted-foreground mt-2 text-xs">JPG, PNG ou WebP — 20MB max par photo</p>
      </div>

      {/* Input caché dédié au remplacement (une seule photo à la fois) */}
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          handleReplaceFileChosen(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      {/* UploadProgress : état réel par fichier (mission §15) */}
      {pendingUploads.length > 0 ? (
        <div className="space-y-2 rounded-lg border p-3">
          {pendingUploads.map((p) => (
            <div key={p.key} className="flex items-center gap-3 text-sm">
              <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local instantané via object URL, jamais optimisable par next/image */}
                <img src={p.previewUrl} alt="" className="size-full object-cover" />
              </div>
              <span className="flex-1 truncate">{p.file.name}</span>
              {p.status === "uploading" ? (
                <>
                  <Progress value={undefined} className="w-20" />
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                </>
              ) : p.status === "success" ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-destructive" />
                  <span className="text-destructive text-xs">{p.error}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => retryUpload(p.key)}>
                    Réessayer
                  </Button>
                </div>
              )}
              {p.status !== "uploading" ? (
                <Button type="button" size="icon" variant="ghost" className="size-6" onClick={() => dismissUpload(p.key)}>
                  ×
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* MediaGallery */}
      {media.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          <ImageIcon className="mx-auto mb-2 size-8 opacity-50" />
          Aucune photo pour ce produit.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item, index) => (
            <div key={item.id} className="group relative overflow-hidden rounded-lg border">
              <div className="bg-muted relative aspect-video w-full">
                <Image
                  src={item.cardUrl}
                  alt={item.altText || item.originalFilename}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
                {item.isCover ? (
                  <Badge className="absolute left-2 top-2 gap-1 bg-amber-500 text-white hover:bg-amber-500">
                    <Star className="size-3 fill-current" /> Couverture
                  </Badge>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-1 border-t bg-background p-1.5">
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={isPending || index === 0}
                    onClick={() => handleMove(index, -1)}
                    aria-label="Déplacer vers le haut"
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={isPending || index === media.length - 1}
                    onClick={() => handleMove(index, 1)}
                    aria-label="Déplacer vers le bas"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-0.5">
                  {!item.isCover ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={isPending}
                      onClick={() => handleSetCover(item.id)}
                      aria-label="Définir comme couverture"
                      title="Définir comme couverture"
                    >
                      <Star className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={isPending}
                    onClick={() => handleReplaceClick(item.id)}
                    aria-label="Remplacer"
                    title="Remplacer"
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <ConfirmActionDialog
                    trigger={
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive size-7"
                        disabled={isPending}
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                    title="Supprimer cette photo ?"
                    description="Cette action est irréversible. La photo sera retirée du produit et supprimée du stockage."
                    confirmLabel="Supprimer"
                    onConfirm={() => handleDelete(item.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
