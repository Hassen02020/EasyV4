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
  ChevronRight as ArrowRight,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react"
import { useState } from "react"

interface RoomOption {
  id: number
  name: string
  freeCancellationDate: string
  available: boolean
  price: number
}

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
  }
  currency?: string
  onBook?: (mealPlan: string, room?: RoomOption) => void
  onViewDetails?: () => void
}

function formatMoney(amount: number, currency = "TND"): string {
  const value = Math.round(amount).toLocaleString("fr-FR")
  return `${value} ${currency}`
}

const amenityIcons: Record<string, React.ReactNode> = {
  "Wi-Fi": <Wifi className="h-4 w-4" />,
  Pool: <Waves className="h-4 w-4" />,
  Breakfast: <Coffee className="h-4 w-4" />,
  Spa: <Sparkles className="h-4 w-4" />,
}

export function HotelCard({
  hotel,
  currency = "TND",
  onBook,
  onViewDetails,
}: HotelCardProps) {
  const [currentImage, setCurrentImage] = useState(0)
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [selectedMealPlan, setSelectedMealPlan] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null)

  const mealOptions = hotel.mealOptions || [hotel.mealPlan]

  const defaultRooms: RoomOption[] = [
    {
      id: 1,
      name: "Double Room Garden View",
      freeCancellationDate: "05/30/2026 00:00",
      available: true,
      price: hotel.discountedPrice,
    },
    {
      id: 2,
      name: "Double Room Garden View",
      freeCancellationDate: "05/30/2026 00:00",
      available: true,
      price: Math.round(hotel.discountedPrice * 1.1),
    },
    {
      id: 3,
      name: "Double Room Sea View",
      freeCancellationDate: "05/30/2026 00:00",
      available: true,
      price: Math.round(hotel.discountedPrice * 1.25),
    },
  ]

  const rooms = hotel.rooms || defaultRooms

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
          />

          {/* Image Navigation */}
          <button
            onClick={prevImage}
            className="bg-card/90 hover:bg-card absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Previous image"
          >
            <ChevronLeft className="text-foreground h-4 w-4" />
          </button>
          <button
            onClick={nextImage}
            className="bg-card/90 hover:bg-card absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Next image"
          >
            <ChevronRight className="text-foreground h-4 w-4" />
          </button>

          {/* Image Dots */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {hotel.images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImage(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentImage ? "bg-card" : "bg-card/50"
                }`}
                aria-label={`View image ${i + 1}`}
              />
            ))}
          </div>

          {/* Wishlist Button */}
          <button
            onClick={() => setIsWishlisted(!isWishlisted)}
            className="bg-card/90 hover:bg-card absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            aria-label={
              isWishlisted ? "Remove from wishlist" : "Add to wishlist"
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

            {/* Tags */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {hotel.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="bg-secondary/30 border-primary/30 text-primary rounded-full px-2 py-0.5 text-xs font-normal"
                >
                  {tag}
                </Badge>
              ))}
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
            {/* Exclusive Badge */}
            {hotel.discountPercent > 0 && (
              <div className="mb-2 rounded bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-1 text-xs font-semibold text-white">
                Exclusive
              </div>
            )}

            <div className="text-right">
              <p className="text-muted-foreground mb-1 text-xs">À partir de</p>
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-primary text-2xl font-bold">
                  {formatMoney(hotel.discountedPrice, currency)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {mealOptions[selectedMealPlan]}
              </p>
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

      {/* Meal Plan Tabs */}
      {mealOptions.length > 1 && (
        <div className="border-border bg-muted/30 border-t">
          <div className="flex">
            {mealOptions.map((plan, index) => (
              <button
                key={plan}
                onClick={() => setSelectedMealPlan(index)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
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

      {/* Room Selection Section */}
      {isExpanded && (
        <div className="border-border bg-card border-t">
          {/* Room Header */}
          <div className="bg-muted/30 border-border border-b px-4 py-3">
            <h4 className="text-foreground font-semibold">
              Chambre 1 : 2 adultes
            </h4>
          </div>

          {/* Room Options */}
          <div className="divide-border divide-y">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room.id)}
                className={`hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                  selectedRoom === room.id
                    ? "bg-primary/5 border-l-primary border-l-4"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {selectedRoom === room.id && (
                    <div className="bg-primary flex h-5 w-5 items-center justify-center rounded-full">
                      <Check className="text-primary-foreground h-3 w-3" />
                    </div>
                  )}
                  <div>
                    <p
                      className={`font-medium ${selectedRoom === room.id ? "text-primary" : "text-foreground"}`}
                    >
                      {room.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Annulation gratuite avant le {room.freeCancellationDate}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          room.available
                            ? "bg-muted text-muted-foreground"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {room.available ? "Disponible" : "Sur demande"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-primary text-lg font-bold">
                    {room.price.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-muted-foreground ml-1 text-xs">
                    {currency}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Book Button */}
          <div className="bg-muted/30 border-border flex justify-end border-t px-4 py-3">
            <Button
              onClick={() => {
                const selected = rooms.find((r) => r.id === selectedRoom)
                onBook?.(mealOptions[selectedMealPlan], selected)
              }}
              disabled={!selectedRoom}
              className="gap-2"
            >
              Réserver
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
