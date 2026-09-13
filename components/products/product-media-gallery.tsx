"use client"

/**
 * ProductMediaGallery — Media System (mission §25), commun à Omraty /
 * Voyages Organisés / Attractions (mission §1/§38 : même composant pour les
 * 3 modules).
 *
 * S'adapte au nombre de médias plutôt que d'imposer une galerie lourde
 * (mission §25) : 1 photo -> image simple sans navigation ; plusieurs ->
 * image principale + vignettes + flèches + compteur + swipe mobile +
 * plein écran. Le composant ne fait AUCUN fallback lui-même — l'appelant
 * ne le monte que si `items.length > 0` (mission §23 : le fallback
 * legacy/générique vit dans la page, pas ici).
 */

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ProductMediaGalleryItem {
  id: string
  largeUrl: string
  thumbnailUrl: string
  altText: string | null
}

const SWIPE_THRESHOLD_PX = 40

export function ProductMediaGallery({
  items,
  productName,
}: {
  items: ProductMediaGalleryItem[]
  productName: string
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  if (items.length === 0) return null

  const active = items[activeIndex]
  const hasMultiple = items.length > 1

  function goTo(index: number) {
    setActiveIndex((index + items.length) % items.length)
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return
    const delta = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      goTo(activeIndex + (delta < 0 ? 1 : -1))
    }
    setTouchStartX(null)
  }

  return (
    <div className="space-y-2">
      <div
        className="group relative aspect-video w-full overflow-hidden rounded-xl bg-muted"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          className="absolute inset-0 z-0 cursor-zoom-in"
          onClick={() => setFullscreen(true)}
          aria-label="Voir en plein écran"
        >
          <Image
            src={active.largeUrl}
            alt={active.altText || productName}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 66vw"
            priority
          />
        </button>

        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 z-10 size-8 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => setFullscreen(true)}
          aria-label="Plein écran"
        >
          <Expand className="size-4" />
        </Button>

        {hasMultiple ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute left-2 top-1/2 z-10 size-8 -translate-y-1/2"
              onClick={() => goTo(activeIndex - 1)}
              aria-label="Photo précédente"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-2 top-1/2 z-10 size-8 -translate-y-1/2"
              onClick={() => goTo(activeIndex + 1)}
              aria-label="Photo suivante"
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="absolute bottom-3 right-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              {activeIndex + 1} / {items.length}
            </div>
          </>
        ) : null}
      </div>

      {hasMultiple ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                index === activeIndex ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
              aria-label={`Voir la photo ${index + 1}`}
              aria-current={index === activeIndex}
            >
              <Image src={item.thumbnailUrl} alt="" fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      ) : null}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent showCloseButton={false} className="max-w-5xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{active.altText || productName}</DialogTitle>
          <div
            className="relative aspect-video w-full"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Image
              src={active.largeUrl}
              alt={active.altText || productName}
              fill
              className="object-contain"
              sizes="100vw"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-2 top-2 size-8"
              onClick={() => setFullscreen(false)}
              aria-label="Fermer"
            >
              <X className="size-4" />
            </Button>
            {hasMultiple ? (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute left-2 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => goTo(activeIndex - 1)}
                  aria-label="Photo précédente"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => goTo(activeIndex + 1)}
                  aria-label="Photo suivante"
                >
                  <ChevronRight className="size-4" />
                </Button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                  {activeIndex + 1} / {items.length}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
