"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Mail,
  Phone,
  Star,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import type { HotelDetailsDTO } from "@/lib/mygo/types"
import { use } from "react"

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&h=600&fit=crop"

interface DetailPageProps {
  params: Promise<{ id: string }>
}

export default function HotelDetailPage({ params }: DetailPageProps) {
  const { id } = use(params)
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <HotelDetailContent id={id} />
    </Suspense>
  )
}

function HotelDetailContent({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [state, setState] = useState<{
    loadedId: string | null
    status: "idle" | "success" | "error"
    data: HotelDetailsDTO | null
    error: string | null
  }>({ loadedId: null, status: "idle", data: null, error: null })

  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/hotels/details/${id}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as {
            message?: string
            error?: string
          }
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<HotelDetailsDTO>
      })
      .then((data) =>
        setState({ loadedId: id, status: "success", data, error: null }),
      )
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setState({
          loadedId: id,
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        })
      })
    return () => ctrl.abort()
  }, [id])

  // Derive status at render time (no setState in effect):
  const effectiveStatus: "loading" | "success" | "error" =
    state.loadedId !== id
      ? "loading"
      : state.status === "idle"
        ? "loading"
        : state.status

  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adults = searchParams.get("adults") ?? "2"
  const children = searchParams.get("children")

  const hotel = state.data
  const images = useMemo(() => {
    if (!hotel) return [] as string[]
    const album = hotel.album.map((a) => a.url).filter(Boolean)
    if (album.length > 0) return album
    if (hotel.image) return [hotel.image]
    return [PLACEHOLDER_IMG]
  }, [hotel])

  const groupedFacilities = useMemo(() => {
    if (!hotel) return new Map<string, string[]>()
    const m = new Map<string, string[]>()
    for (const f of hotel.facilities) {
      const cat = f.category ?? "Équipements"
      if (!m.has(cat)) m.set(cat, [])
      m.get(cat)!.push(f.title)
    }
    return m
  }, [hotel])

  const handleCheckAvailability = () => {
    if (!hotel) return
    if (checkin && checkout && hotel.cityId) {
      const qs = new URLSearchParams()
      qs.set("cityId", String(hotel.cityId))
      if (hotel.cityName) qs.set("city", hotel.cityName)
      qs.set("checkin", checkin)
      qs.set("checkout", checkout)
      qs.set("adults", adults)
      if (children) qs.set("children", children)
      qs.set("onlyAvailable", "1")
      router.push(`/hotels/search?${qs.toString()}`)
    } else {
      router.push("/")
    }
  }

  if (effectiveStatus === "loading") return <DetailSkeleton />

  if (effectiveStatus === "error" || !hotel) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-12">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
            Impossible de charger les détails de cet hôtel : {state.error ?? "introuvable"}
          </div>
          <div className="mt-4">
            <Link href="/" className="text-sm text-primary hover:underline">
              ← Retour à l&apos;accueil
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux résultats
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Gallery images={images} active={activeImage} onChange={setActiveImage} />

            <div>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    {hotel.name}
                  </h1>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    {(hotel.stars ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        {Array.from({ length: hotel.stars ?? 0 }).map((_, i) => (
                          <Star
                            key={i}
                            className="w-4 h-4 fill-amber-400 text-amber-400"
                          />
                        ))}
                      </span>
                    )}
                    <span>{hotel.categoryTitle ?? `${hotel.stars ?? 0} étoiles`}</span>
                  </div>
                </div>
                {hotel.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {hotel.themes.slice(0, 4).map((theme) => (
                      <span
                        key={theme}
                        className="text-xs py-0.5 px-2 bg-secondary/30 border border-primary/30 text-primary font-normal rounded-full"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(hotel.address || hotel.cityName) && (
                <div className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>
                    {[hotel.address, hotel.cityName, hotel.region]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
            </div>

            {hotel.shortDescription && (
              <section>
                <h2 className="text-lg font-semibold text-primary mb-2">
                  Aperçu
                </h2>
                <p className="text-sm text-foreground leading-relaxed">
                  {hotel.shortDescription}
                </p>
              </section>
            )}

            {hotel.longDescription && (
              <section>
                <h2 className="text-lg font-semibold text-primary mb-2">
                  Description
                </h2>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                  {hotel.longDescription}
                </p>
              </section>
            )}

            {groupedFacilities.size > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-primary mb-3">
                  Équipements & services
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from(groupedFacilities.entries()).map(([cat, items]) => (
                    <div key={cat}>
                      <h3 className="text-sm font-medium text-foreground mb-1.5">
                        {cat}
                      </h3>
                      <ul className="space-y-1">
                        {items.map((item, i) => (
                          <li
                            key={`${cat}-${i}`}
                            className="text-sm text-muted-foreground"
                          >
                            • {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {hotel.options.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-primary mb-3">
                  Options sur place
                </h2>
                <div className="flex flex-wrap gap-2">
                  {hotel.options.map((opt) => (
                    <span
                      key={opt.id}
                      className="text-xs py-1 px-2.5 bg-muted text-foreground rounded-full"
                    >
                      {opt.title}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start space-y-4">
            <div className="bg-card rounded-lg border border-border p-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Vérifier les tarifs</p>
                <p className="text-sm text-foreground mt-1">
                  {checkin && checkout
                    ? "Pour vos dates et voyageurs sélectionnés"
                    : "Choisissez vos dates pour voir les disponibilités"}
                </p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleCheckAvailability}
                size="lg"
              >
                <Calendar className="w-4 h-4" />
                {checkin && checkout
                  ? "Voir les disponibilités"
                  : "Choisir mes dates"}
              </Button>

              {(hotel.email || hotel.phone) && (
                <div className="border-t border-border pt-4 space-y-2">
                  <h3 className="text-sm font-semibold text-primary">Contact</h3>
                  {hotel.email && (
                    <a
                      href={`mailto:${hotel.email}`}
                      className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                    >
                      <Mail className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{hotel.email}</span>
                    </a>
                  )}
                  {hotel.phone && (
                    <a
                      href={`tel:${hotel.phone}`}
                      className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span>{hotel.phone}</span>
                    </a>
                  )}
                </div>
              )}

              {hotel.latitude && hotel.longitude && (
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-primary mb-2">
                    Localisation
                  </h3>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <MapPin className="w-4 h-4" />
                    Voir sur Google Maps
                  </a>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Gallery({
  images,
  active,
  onChange,
}: {
  images: string[]
  active: number
  onChange: (next: number) => void
}) {
  const safe = images.length > 0 ? images : [PLACEHOLDER_IMG]
  const idx = Math.min(active, safe.length - 1)
  const next = () => onChange((idx + 1) % safe.length)
  const prev = () => onChange((idx - 1 + safe.length) % safe.length)

  return (
    <div>
      <div className="relative w-full h-72 md:h-96 rounded-lg overflow-hidden bg-muted group">
        <div
          className="w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url(${safe[idx]})` }}
          role="img"
          aria-label="Photo principale de l'hôtel"
        />

        {safe.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-card/90 rounded-full flex items-center justify-center hover:bg-card transition-colors"
              aria-label="Photo précédente"
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-card/90 rounded-full flex items-center justify-center hover:bg-card transition-colors"
              aria-label="Photo suivante"
            >
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
            <div className="absolute bottom-3 right-3 bg-card/80 text-xs px-2 py-1 rounded-full text-foreground">
              {idx + 1} / {safe.length}
            </div>
          </>
        )}
      </div>

      {safe.length > 1 && (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {safe.slice(0, 6).map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                i === idx ? "border-primary" : "border-transparent"
              }`}
              aria-label={`Voir la photo ${i + 1}`}
            >
              <div
                className="w-full h-full bg-cover bg-center"
                style={{ backgroundImage: `url(${url})` }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-72 md:h-96 w-full rounded-lg" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </main>
      <Footer />
    </div>
  )
}
