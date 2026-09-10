"use client"

/**
 * Favoris (Wishlist) — affichage `/compte`. Instantané capturé à l'ajout
 * (voir lib/favorites/favorites-core.ts) : `priceFrom` est TOUJOURS en TND
 * base (même convention que components/hotel-card.tsx), reconverti à
 * l'affichage via `useCurrency().format()` — jamais un prix/disponibilité
 * revérifié ici (l'utilisateur revoit le prix réel en suivant le lien).
 */

import { useState } from "react"
import Link from "next/link"
import { Heart, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useCurrency } from "@/components/currency-context"
import { removeFavorite } from "@/app/actions/remove-favorite"
import type { MyFavorite } from "@/app/actions/list-my-favorites"

const ITEM_TYPE_LABEL: Record<MyFavorite["itemType"], string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
}

export function CompteFavoritesCard({ favorites }: { favorites: MyFavorite[] }) {
  const { format } = useCurrency()
  const [items, setItems] = useState(favorites)
  const [removingId, setRemovingId] = useState<string | null>(null)

  function handleRemove(id: string) {
    if (removingId) return
    setRemovingId(id)
    removeFavorite({ id })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        setItems((prev) => prev.filter((f) => f.id !== id))
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setRemovingId(null))
  }

  return (
    <div className="bg-card border-border mb-6 rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Heart className="fill-destructive text-destructive h-4 w-4" />
        <span className="text-foreground text-sm font-semibold">Mes favoris</span>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Vous n&apos;avez pas encore de favoris. Cliquez sur le cœur d&apos;un hôtel, d&apos;un
          voyage ou d&apos;une activité pour le retrouver ici.
        </p>
      ) : (
      <ul className="space-y-2">
        {items.map((fav) => (
          <li
            key={fav.id}
            className="border-border flex items-center gap-3 rounded-xl border p-2.5"
          >
            {fav.imageUrl ? (
              <div
                className="h-14 w-14 shrink-0 rounded-lg bg-cover bg-center"
                style={{ backgroundImage: `url(${fav.imageUrl})` }}
                role="img"
                aria-label={fav.title}
              />
            ) : (
              <div className="bg-muted h-14 w-14 shrink-0 rounded-lg" />
            )}

            <div className="min-w-0 flex-1">
              <Link href={fav.href} className="text-foreground truncate text-sm font-medium hover:underline">
                {fav.title}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {ITEM_TYPE_LABEL[fav.itemType]}
                {fav.location ? ` · ${fav.location}` : ""}
              </p>
              {fav.priceFrom != null && (
                <p className="text-foreground mt-0.5 text-xs font-semibold">
                  à partir de {format(Number(fav.priceFrom))}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleRemove(fav.id)}
              disabled={removingId === fav.id}
              className="text-muted-foreground hover:text-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60"
              aria-label="Retirer des favoris"
            >
              {removingId === fav.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
