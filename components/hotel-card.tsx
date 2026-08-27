"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Star,
  MapPin,
  Wifi,
  Waves,
  Coffee,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Heart,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Award,
} from "lucide-react"
import { useState } from "react"
import { useCurrency } from "@/components/currency-context"
import { HotelRoomRates, type RoomOption } from "@/components/hotel-room-rates"

export type { RoomOption }

interface HotelCardProps {
  hotel: {
    id: number
    name: string
    location: string
    rating: number
    stars: number
    amenities: string[]
    tags: string[]
    originalPrice: number
    discountedPrice: number
    discountPercent: number
    images: string[]
    mealPlan: string
    mealOptions?: string[]
    rooms?: RoomOption[]
    /** PHASE 30.2 — permet d'afficher "Annulation gratuite" sans devoir déplier "Tarifs & chambres". */
    hasFreeCancellation?: boolean
  }
  onBook?: (mealPlan: string, room?: RoomOption) => void
  onViewDetails?: () => void
  currency?: string
}

const amenityIcons: Record<string, React.ReactNode> = {
  "Wi-Fi": <Wifi className="h-4 w-4" />,
  Pool: <Waves className="h-4 w-4" />,
  Breakfast: <Coffee className="h-4 w-4" />,
  Spa: <Sparkles className="h-4 w-4" />,
}

export function HotelCard({ hotel, onBook, onViewDetails }: HotelCardProps) {
  const { format } = useCurrency()
  const [currentImage, setCurrentImage] = useState(0)
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [selectedMealPlan, setSelectedMealPlan] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)

  const mealOptions = hotel.mealOptions || [hotel.mealPlan]

  // Jamais de chambres fictives : si myGo n'a renvoyé aucune chambre
  // réservable pour cette offre, la section "Tarifs & chambres" l'affiche
  // honnêtement plutôt que de fabriquer des prix/noms de démo.
  const rooms = hotel.rooms ?? []

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % hotel.images.length)
  }

  const prevImage = () => {
    setCurrentImage(
      (prev) => (prev - 1 + hotel.images.length) % hotel.images.length,
    )
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md">
      {/* Main Card Content */}
      <div className="flex flex-col md:flex-row">
        {/* Image Gallery */}
        <div className="bg-muted group relative h-48 w-full shrink-0 md:h-auto md:w-64 lg:w-72">
          <div
            className="h-full min-h-[180px] w-full bg-cover bg-center"
            style={{
              backgroundImage: `url(${hotel.images[currentImage]})`,
            }}
            role="img"
            aria-label={`Photo de ${hotel.name}`}
          />

          {/* PHASE 30 — visibles par défaut sur mobile (aucun hover tactile) ;
              révélées au survol seulement à partir de md (pointeur souris),
              corrige des flèches inaccessibles sur tactile trouvé pendant
              l'audit. PHASE 30 (audit) — aria-label en français (cohérence
              avec le reste de l'UI) + type="button" explicite. */}
          <button
            type="button"
            onClick={prevImage}
            className="bg-card/90 hover:bg-card absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label="Photo précédente"
          >
            <ChevronLeft className="text-foreground h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextImage}
            className="bg-card/90 hover:bg-card absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label="Photo suivante"
          >
            <ChevronRight className="text-foreground h-4 w-4" />
          </button>

          {/* Image Dots */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {hotel.images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentImage(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentImage ? "bg-card" : "bg-card/50"
                }`}
                aria-label={`Voir la photo ${i + 1}`}
              />
            ))}
          </div>

          {/* Wishlist Button */}
          <button
            type="button"
            onClick={() => setIsWishlisted(!isWishlisted)}
            className="bg-card/90 hover:bg-card absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            aria-label={
              isWishlisted
                ? "Retirer des favoris"
                : "Ajouter aux favoris"
            }
          >
            <Heart
              className={`h-4 w-4 ${
                isWishlisted
                  ? "fill-destructive text-destructive"
                  : "text-foreground"
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row">
          {/* Hotel Details */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="text-primary truncate text-lg font-bold">
                {hotel.name}
              </h3>
              <div className="flex shrink-0 items-center gap-0.5">
                {Array.from({ length: hotel.stars }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onViewDetails}
              className="text-primary mb-3 inline-flex items-center gap-1 text-sm hover:underline"
            >
              <MapPin className="h-3.5 w-3.5 text-amber-500" />
              {hotel.location}
            </button>

            {/* Tags — PHASE 30.3 : chaque badge communique un signal
                DIFFÉRENT, jamais un style générique unique :
                - "Promo" = opportunité de prix (offer.discountPercent > 0,
                  myGo basePrice réel) → accent rouge/feu ;
                - "Recommandé" = choix du Ranking Engine (offer.recommended,
                  backend) → accent plein primary/award, JAMAIS confondu
                  avec un simple thème (avant Phase 30.3 : même style
                  outline que les tags de thème, donc invisible au scan) ;
                - thèmes réels (h.themes) = information neutre → outline. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {hotel.tags.map((tag) =>
                tag === "Promo" ? (
                  <Badge
                    key={tag}
                    className="rounded-full border-transparent bg-red-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    🔥 Promo
                  </Badge>
                ) : tag === "Recommandé" ? (
                  <Badge
                    key={tag}
                    className="bg-primary text-primary-foreground hover:bg-primary flex items-center gap-1 rounded-full border-transparent px-2 py-0.5 text-xs font-semibold"
                  >
                    <Award className="h-3 w-3" />
                    Recommandé
                  </Badge>
                ) : (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="bg-secondary/30 border-primary/30 text-primary rounded-full px-2 py-0.5 text-xs font-normal"
                  >
                    {tag}
                  </Badge>
                ),
              )}
            </div>

            {/* Amenities */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-3">
              {hotel.amenities.map((amenity) => (
                <div
                  key={amenity}
                  className="flex items-center gap-1.5 text-sm"
                >
                  {amenityIcons[amenity]}
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Section */}
          <div className="border-border flex min-w-[150px] flex-col items-end justify-between border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-4">
            {/* PHASE 30 — badge affiché uniquement quand une remise RÉELLE
                existe (myGo basePrice > price), jamais inconditionnellement. */}
            {hotel.discountPercent > 0 && (
              <div className="bg-primary text-primary-foreground mb-2 rounded-full px-2 py-1 text-xs font-semibold">
                -{hotel.discountPercent}%
              </div>
            )}

            <div className="text-right">
              <p className="text-muted-foreground mb-1 text-xs">À partir de</p>
              <div className="flex items-baseline justify-end gap-1.5">
                {hotel.discountPercent > 0 && (
                  <span className="text-muted-foreground text-sm line-through">
                    {format(hotel.originalPrice)}
                  </span>
                )}
                <span className="text-primary text-2xl font-bold">
                  {format(hotel.discountedPrice)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {mealOptions[selectedMealPlan]}
                {/* PHASE 30 (audit K/L) — signale qu'il existe d'autres
                    formules réelles sans devoir déplier la card, comme le
                    fait déjà l'annulation gratuite ci-dessous. */}
                {mealOptions.length > 1 && (
                  <span className="text-muted-foreground/70">
                    {" "}
                    · {mealOptions.length} formules disponibles
                  </span>
                )}
              </p>
              {/* PHASE 30.2 — répond à "l'annulation est-elle gratuite ?"
                  directement sur la card (donnée réelle, même règle 3-états
                  que la liste de chambres dépliée) — pas besoin d'ouvrir
                  "Tarifs & chambres" pour le savoir. */}
              {hotel.hasFreeCancellation && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Annulation gratuite
                </p>
              )}
            </div>

            <div className="mt-3 flex w-full flex-col gap-2">
              {onViewDetails && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onViewDetails}
                >
                  Voir détails
                </Button>
              )}
              <Button
                className="w-full gap-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                Tarifs & chambres
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Meal Plan Tabs — PHASE 30 : défile horizontalement au lieu de
          déborder/couper les libellés quand 3+ pensions existent (BB/HB/
          FB/AI courant sur myGo), trouvé pendant l'audit mobile. */}
      {mealOptions.length > 1 && (
        <div className="border-border bg-muted/30 border-t">
          <div className="flex overflow-x-auto">
            {mealOptions.map((plan, index) => (
              <button
                key={plan}
                onClick={() => setSelectedMealPlan(index)}
                className={`shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedMealPlan === index
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {plan}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Room Selection Section — voir components/hotel-room-rates.tsx (partagé avec la fiche hôtel). */}
      {isExpanded && (
        <div className="border-border border-t">
          <HotelRoomRates rooms={rooms} onBook={onBook} />
        </div>
      )}
    </div>
  )
}
