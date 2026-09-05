"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
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
  ShieldCheck,
  Building2,
  Heart,
  Flame,
  Wifi,
  Waves,
  Car,
  Wind,
  Dumbbell,
  UtensilsCrossed,
  Sparkles,
  Check,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import type { HotelDetailsDTO, HotelOfferDTO, HotelSearchResultDTO } from "@/lib/mygo/types"
import { use } from "react"
import { HotelRoomRates, type RoomOption } from "@/components/hotel-room-rates"
import { toCardShape } from "@/components/hotel-listings"
import { encodeDraft } from "@/lib/booking/draft-store"
import { useCurrency } from "@/components/currency-context"
import { ProductReviewsSectionClient } from "@/components/reviews/product-reviews-section-client"

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&h=600&fit=crop"

/**
 * PHASE 31 — icône PUREMENT visuelle par mot-clé sur le libellé réel de la
 * facilité (myGo, texte libre) — jamais une donnée inventée, juste un
 * glyphe : si aucun mot-clé ne correspond, repli sur une icône générique
 * (Check), jamais une icône trompeuse par défaut.
 */
const FACILITY_KEYWORD_ICONS: [RegExp, LucideIcon][] = [
  [/wi-?fi|internet/i, Wifi],
  [/piscine|pool/i, Waves],
  [/parking|garage/i, Car],
  [/climatisation|air condition/i, Wind],
  [/fitness|salle de sport|gym/i, Dumbbell],
  [/restaurant|petit-d[ée]jeuner|bar\b/i, UtensilsCrossed],
  [/spa|massage|bien-[êe]tre/i, Sparkles],
]

function facilityIcon(title: string): LucideIcon {
  for (const [pattern, Icon] of FACILITY_KEYWORD_ICONS) {
    if (pattern.test(title)) return Icon
  }
  return Check
}

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
  const { format } = useCurrency()

  const [state, setState] = useState<{
    loadedId: string | null
    status: "idle" | "success" | "error"
    data: HotelDetailsDTO | null
    error: string | null
  }>({ loadedId: null, status: "idle", data: null, error: null })

  const [activeImage, setActiveImage] = useState(0)
  // PHASE 30.4 — cible de scroll/focus pour le CTA sidebar "Voir les
  // disponibilités" quand les tarifs de cet hôtel sont déjà chargés sur
  // cette page (voir handleCheckAvailability).
  const roomsHeadingRef = useRef<HTMLHeadingElement>(null)
  // PHASE 32 — chambre actuellement sélectionnée dans "Chambres et tarifs"
  // (notifiée par HotelRoomRates, source de vérité toujours interne à ce
  // composant) — permet au panneau sticky de refléter le choix réel du
  // client plutôt qu'un simple prix générique "à partir de".
  const [selectedRoom, setSelectedRoom] = useState<RoomOption | null>(null)

  // PHASE 30 — tarifs/chambres réels pour CET hôtel, scopés via le même
  // paramètre `hotelId` déjà supporté par HotelSearchQuerySchema/myGo (voir
  // lib/mygo/search-core.ts, lib/mygo/client.ts) — aucune nouvelle route,
  // aucun nouveau paramètre inventé. `/api/hotels/details-public/[id]`
  // reste volontairement sans prix (voir sa doc) : les tarifs viennent
  // exclusivement de /api/hotels/search-public, comme sur la SERP.
  const [roomsState, setRoomsState] = useState<{
    /** Clé de la dernière requête résolue (checkin|checkout|adults|children|cityId) — comparée à la clé courante au rendu (même idiome que `state.loadedId` ci-dessus) pour dériver "loading" sans setState synchrone dans l'effet. */
    loadedKey: string | null
    status: "success" | "error"
    offer: HotelSearchResultDTO["offers"][number] | null
    error: string | null
  }>({ loadedKey: null, status: "success", offer: null, error: null })

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/hotels/details-public/${id}`, { signal: ctrl.signal })
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

  // Clé de la requête courante — `null` tant qu'on n'a pas de quoi
  // construire une requête valide (dates absentes, ou cityId pas encore
  // connu le temps que la fiche hôtel charge).
  const roomsRequestKey =
    checkin && checkout && state.data?.cityId
      ? `${id}|${checkin}|${checkout}|${adults}|${children ?? ""}|${state.data.cityId}`
      : null

  // PHASE 30 — recherche re-scopée sur CET hôtel uniquement (`hotelId`),
  // dès que dates + cityId connus — même moteur/même route publique que la
  // SERP (jamais un second pipeline de recherche/normalisation). Aucun
  // setState synchrone dans le corps de l'effet (même idiome que l'effet
  // de détails ci-dessus) — "loading" est dérivé au rendu en comparant
  // `roomsState.loadedKey` à `roomsRequestKey`.
  useEffect(() => {
    if (!roomsRequestKey || !checkin || !checkout) return
    const ctrl = new AbortController()
    const params = new URLSearchParams({ hotelId: id, checkin, checkout, adults })
    if (children) params.set("children", children)
    if (state.data?.cityId) params.set("cityId", String(state.data.cityId))
    fetch(`/api/hotels/search-public?${params.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string }
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<HotelSearchResultDTO>
      })
      .then((data) => {
        setRoomsState({
          loadedKey: roomsRequestKey,
          status: "success",
          offer: data.offers[0] ?? null,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setRoomsState({
          loadedKey: roomsRequestKey,
          status: "error",
          offer: null,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        })
      })
    return () => ctrl.abort()
  }, [roomsRequestKey, id, checkin, checkout, adults, children, state.data?.cityId])

  const roomsEffectiveStatus: "idle" | "loading" | "success" | "error" =
    !roomsRequestKey
      ? "idle"
      : roomsState.loadedKey !== roomsRequestKey
        ? "loading"
        : roomsState.status

  // PHASE 30 — "Hôtels similaires" (section ALTERNATIVES) : mêmes hôtels
  // que ceux réellement renvoyés par le moteur de recherche pour la même
  // ville/dates/voyageurs (jamais une liste inventée) — même route/même
  // classement serveur (Ranking Engine) que la SERP, juste filtrée pour
  // exclure l'hôtel courant. Clé au niveau ville (pas d'hôtel) : les
  // mêmes alternatives valent pour toutes les fiches hôtel de cette ville.
  const [altState, setAltState] = useState<{
    loadedKey: string | null
    status: "success" | "error"
    offers: HotelOfferDTO[]
    error: string | null
  }>({ loadedKey: null, status: "success", offers: [], error: null })

  const altRequestKey =
    checkin && checkout && state.data?.cityId
      ? `${state.data.cityId}|${checkin}|${checkout}|${adults}|${children ?? ""}`
      : null

  useEffect(() => {
    if (!altRequestKey || !checkin || !checkout || !state.data?.cityId) return
    const ctrl = new AbortController()
    const params = new URLSearchParams({
      cityId: String(state.data.cityId),
      checkin,
      checkout,
      adults,
    })
    if (children) params.set("children", children)
    fetch(`/api/hotels/search-public?${params.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<HotelSearchResultDTO>
      })
      .then((data) => {
        setAltState({ loadedKey: altRequestKey, status: "success", offers: data.offers, error: null })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setAltState({
          loadedKey: altRequestKey,
          status: "error",
          offers: [],
          error: err instanceof Error ? err.message : "Erreur inconnue",
        })
      })
    return () => ctrl.abort()
  }, [altRequestKey, checkin, checkout, adults, children, state.data?.cityId])

  const altEffectiveStatus: "idle" | "loading" | "success" | "error" =
    !altRequestKey ? "idle" : altState.loadedKey !== altRequestKey ? "loading" : altState.status

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
    // PHASE 30.4 — audit : quand les tarifs de CET hôtel sont déjà chargés
    // sur la page courante (mêmes dates/voyageurs), ce CTA redirigeait
    // quand même vers une nouvelle recherche SERP complète — une boucle de
    // navigation inutile (nouvel appel réseau, perte de la position de
    // scroll) pour ré-afficher une information déjà visible plus bas sur
    // CETTE page. On scrolle/focus vers "Chambres et tarifs" à la place —
    // aucune nouvelle recherche, aucun rechargement.
    if (roomsEffectiveStatus === "success") {
      roomsHeadingRef.current?.focus()
      roomsHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    if (checkin && checkout && hotel.cityId) {
      // Repart de la recherche courante telle quelle (filtres, tri,
      // multi-chambres…) — seuls cityId/city sont recalés depuis la fiche
      // hôtel (source de vérité pour cet hôtel précis). Repli conservé pour
      // les cas où les tarifs de cet hôtel ne sont PAS encore chargés/
      // disponibles sur cette page (dates absentes, cityId pas encore
      // connu, erreur de chargement) — jamais une page vide sans action.
      const qs = new URLSearchParams(searchParams.toString())
      qs.set("cityId", String(hotel.cityId))
      if (hotel.cityName) qs.set("city", hotel.cityName)
      qs.set("checkin", checkin)
      qs.set("checkout", checkout)
      qs.set("adults", adults)
      if (children) qs.set("children", children)
      if (!qs.get("onlyAvailable")) qs.set("onlyAvailable", "1")
      router.push(`/hotels/search?${qs.toString()}`)
    } else {
      router.push("/")
    }
  }

  // PHASE 30 — réutilise EXACTEMENT le même mapping offre→chambres que la
  // SERP (components/hotel-listings.tsx::toCardShape) : mêmes règles de
  // meilleur tarif, mêmes 3 états d'annulation, jamais une seconde logique.
  const cardShape = useMemo(
    () => (roomsState.offer ? toCardShape(roomsState.offer) : null),
    [roomsState.offer],
  )
  const rooms: RoomOption[] = useMemo(() => cardShape?.rooms ?? [], [cardShape])

  // PHASE 32 — si les chambres rechargent (nouvelles dates) et que la
  // sélection précédente n'existe plus dans la nouvelle liste, on l'ignore
  // au rendu plutôt que de la "nettoyer" via un effet (jamais de setState
  // synchrone dans un effet dans ce fichier — même convention que
  // `effectiveStatus`/`roomsEffectiveStatus` ci-dessus).
  const effectiveSelectedRoom =
    selectedRoom && rooms.some((r) => r.key === selectedRoom.key) ? selectedRoom : null

  // ALTERNATIVES — mêmes offres que le moteur de recherche a réellement
  // renvoyées pour cette ville/ces dates (déjà classées côté serveur par le
  // Ranking Engine existant, jamais re-triées ici), hôtel courant exclu,
  // même mapping offre→card que la SERP (toCardShape).
  const similarHotels = useMemo(() => {
    if (!hotel) return []
    return altState.offers
      .filter((o) => o.hotel.id !== hotel.id)
      .slice(0, 4)
      .map((o) => toCardShape(o))
  }, [altState.offers, hotel])

  // "WHY CHOOSE" — uniquement des constats vérifiables tirés des données
  // déjà chargées (fiche hôtel + tarifs) : jamais une note/avis inventés.
  // Section absente si aucun constat réel ne s'applique. PHASE 30.3 — une
  // icône distincte par TYPE de constat (catégorie/annulation/équipements/
  // thème/promo), jamais une seule icône générique répétée pour tout.
  const whyChooseReasons = useMemo(() => {
    if (!hotel) return []
    const reasons: { icon: LucideIcon; text: string }[] = []
    if ((hotel.stars ?? 0) >= 4) {
      reasons.push({ icon: Star, text: `Hôtel ${hotel.stars} étoiles` })
    }
    if (rooms.some((r) => r.cancellation === "FREE")) {
      reasons.push({
        icon: ShieldCheck,
        text: "Annulation gratuite disponible sur au moins une chambre",
      })
    }
    if (hotel.facilities.length >= 5) {
      reasons.push({
        icon: Building2,
        text: `${hotel.facilities.length} équipements sur place`,
      })
    }
    if (hotel.themes.length > 0) {
      reasons.push({
        icon: Heart,
        text: `Idéal pour : ${hotel.themes.slice(0, 2).join(", ")}`,
      })
    }
    if (cardShape && cardShape.discountPercent > 0) {
      reasons.push({
        icon: Flame,
        text: `Tarif actuellement réduit de ${cardShape.discountPercent}%`,
      })
    }
    // PHASE 32 — dérivées de cardShape.mealOptions (pensions RÉELLES de
    // cette offre, déjà chargées) : jamais une pension inventée ni un
    // décompte fabriqué.
    if (cardShape?.mealOptions?.some((m) => /all inclusive/i.test(m))) {
      reasons.push({ icon: UtensilsCrossed, text: "Formule All Inclusive disponible" })
    }
    if ((cardShape?.mealOptions?.length ?? 0) > 1) {
      reasons.push({
        icon: UtensilsCrossed,
        text: `${cardShape!.mealOptions!.length} formules de pension au choix`,
      })
    }
    return reasons
  }, [hotel, rooms, cardShape])

  const handleBookRoom = (mealPlan: string, room?: RoomOption) => {
    if (!hotel || !room || !checkin || !checkout || !cardShape) return
    if (room.boardingId == null || room.boardingCode == null) return
    let nights = 1
    try {
      const ms =
        new Date(`${checkout}T00:00:00Z`).getTime() -
        new Date(`${checkin}T00:00:00Z`).getTime()
      nights = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)))
    } catch {
      nights = 1
    }
    const adultsNum = Number(adults) || 1
    const childrenAgesArr = (children ?? "")
      .split(",")
      .map((a) => parseInt(a, 10))
      .filter((n) => Number.isFinite(n))
    // Même contrat de brouillon que app/hotels/search/page.tsx::handleBookHotel
    // (même pipeline CheckRate/BookingCreation, jamais un second tunnel).
    const token = encodeDraft({
      draft: {
        module: "hotel",
        offerId: String(hotel.id),
        offerLabel: `${hotel.name} — ${room.name}`,
        startDate: checkin,
        endDate: checkout,
        adults: adultsNum,
        children: childrenAgesArr.length,
        unitPriceTnd: room.price / adultsNum,
        currency: "TND",
        metadata: {
          hotelImage: images[0],
          mealPlan,
          nights,
          location: cardShape.location,
          myGoToken: cardShape.myGoToken,
          cityId: cardShape.cityId,
          hotelId: hotel.id,
          boardingId: room.boardingId,
          boardingCode: room.boardingCode,
          roomId: room.id,
          childrenAges: childrenAgesArr,
        },
      },
    })
    router.push(`/booking?d=${encodeURIComponent(token)}`)
  }

  if (effectiveStatus === "loading") return <DetailSkeleton />

  if (effectiveStatus === "error" || !hotel) {
    return (
      <div className="bg-background min-h-screen">
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-12">
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
            Impossible de charger les détails de cet hôtel :{" "}
            {state.error ?? "introuvable"}
          </div>
          {/* PHASE 30.4 — audit : ce lien renvoyait toujours vers l'accueil,
              même quand la recherche d'origine (destination/dates/
              voyageurs/filtres) est intacte dans `searchParams` (arrivée
              normale depuis la SERP, voir hotel-listings.tsx::
              handleViewDetails) — forçant à tout ressaisir pour une simple
              erreur de chargement des DÉTAILS d'un hôtel, pas de la
              recherche elle-même. */}
          <div className="mt-4">
            <Link
              href={
                searchParams.toString()
                  ? `/hotels/search?${searchParams.toString()}`
                  : "/"
              }
              className="text-primary text-sm hover:underline"
            >
              ← {searchParams.toString() ? "Retour aux résultats" : "Retour à l'accueil"}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-primary mb-4 inline-flex items-center gap-1.5 text-sm hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux résultats
        </button>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Gallery
              images={images}
              active={activeImage}
              onChange={setActiveImage}
            />

            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-foreground text-2xl font-bold md:text-3xl">
                    {hotel.name}
                  </h1>
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
                    {(hotel.stars ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        {Array.from({ length: hotel.stars ?? 0 }).map(
                          (_, i) => (
                            <Star
                              key={i}
                              className="h-4 w-4 fill-amber-400 text-amber-400"
                            />
                          ),
                        )}
                      </span>
                    )}
                    <span>
                      {hotel.categoryTitle ?? `${hotel.stars ?? 0} étoiles`}
                    </span>
                  </div>
                </div>
                {hotel.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {hotel.themes.slice(0, 4).map((theme) => (
                      <span
                        key={theme}
                        className="bg-secondary/30 border-primary/30 text-primary rounded-full border px-2 py-0.5 text-xs font-normal"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(hotel.address || hotel.cityName) && (
                <div className="text-muted-foreground mt-3 flex items-start gap-1.5 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    {[hotel.address, hotel.cityName, hotel.region]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* PHASE 30 — ROOMS & RATES : la fiche hôtel n'affichait
                jusqu'ici AUCUN tarif/chambre (trouvé pendant l'audit) — la
                réservation n'était possible que depuis la card de la SERP.
                Même moteur de recherche/tarification que la SERP
                (/api/hotels/search-public scopé par hotelId), jamais un
                second pipeline. */}
            <section>
              <h2
                ref={roomsHeadingRef}
                tabIndex={-1}
                className="text-primary mb-3 text-lg font-semibold outline-none"
              >
                Chambres et tarifs
              </h2>
              {roomsEffectiveStatus === "idle" ? (
                <div className="border-border text-muted-foreground rounded-lg border p-6 text-center text-sm">
                  Sélectionnez vos dates pour voir les tarifs disponibles.
                </div>
              ) : roomsEffectiveStatus === "loading" ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : roomsEffectiveStatus === "error" ? (
                <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
                  Impossible de charger les tarifs : {roomsState.error}
                </div>
              ) : (
                <HotelRoomRates
                  rooms={rooms}
                  onBook={handleBookRoom}
                  showHeader={false}
                  onSelectionChange={setSelectedRoom}
                />
              )}
            </section>

            {/* PHASE 30 — WHY CHOOSE : uniquement des constats réels tirés
                des données déjà chargées (voir whyChooseReasons ci-dessus) —
                jamais de note/avis fabriqués. Absente si aucun constat ne
                s'applique. */}
            {whyChooseReasons.length > 0 && (
              <section>
                <h2 className="text-primary mb-3 text-lg font-semibold">
                  Pourquoi choisir cet hôtel
                </h2>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {whyChooseReasons.map(({ icon: Icon, text }) => (
                    <li
                      key={text}
                      className="border-border bg-card flex items-start gap-2.5 rounded-lg border p-3 text-sm"
                    >
                      <Icon className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                      <span className="text-foreground">{text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hotel.shortDescription && (
              <section>
                <h2 className="text-primary mb-2 text-lg font-semibold">
                  Aperçu
                </h2>
                <p className="text-foreground text-sm leading-relaxed">
                  {hotel.shortDescription}
                </p>
              </section>
            )}

            {hotel.longDescription && (
              <section>
                <h2 className="text-primary mb-2 text-lg font-semibold">
                  Description
                </h2>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-line">
                  {hotel.longDescription}
                </p>
              </section>
            )}

            {groupedFacilities.size > 0 && (
              <section>
                <h2 className="text-primary mb-3 text-lg font-semibold">
                  Équipements & services
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Array.from(groupedFacilities.entries()).map(
                    ([cat, items]) => (
                      <div key={cat}>
                        <h3 className="text-foreground mb-1.5 text-sm font-medium">
                          {cat}
                        </h3>
                        <ul className="space-y-1.5">
                          {items.map((item, i) => {
                            const Icon = facilityIcon(item)
                            return (
                              <li
                                key={`${cat}-${i}`}
                                className="text-muted-foreground flex items-center gap-2 text-sm"
                              >
                                <Icon className="text-primary/70 h-4 w-4 shrink-0" />
                                {item}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            {hotel.options.length > 0 && (
              <section>
                <h2 className="text-primary mb-3 text-lg font-semibold">
                  Options sur place
                </h2>
                <div className="flex flex-wrap gap-2">
                  {hotel.options.map((opt) => (
                    <span
                      key={opt.id}
                      className="bg-muted text-foreground rounded-full px-2.5 py-1 text-xs"
                    >
                      {opt.title}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* PHASE 30 — ALTERNATIVES : mêmes hôtels que le moteur de
                recherche renvoie réellement pour cette ville/ces dates
                (voir similarHotels ci-dessus), jamais une liste inventée.
                N'apparaît que si des dates sont sélectionnées (les
                alternatives dépendent de la disponibilité/prix réels). */}
            {altEffectiveStatus === "loading" ? (
              <section>
                <h2 className="text-primary mb-3 text-lg font-semibold">
                  Hôtels similaires
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              </section>
            ) : (
              altEffectiveStatus === "success" &&
              similarHotels.length > 0 && (
                <section>
                  <h2 className="text-primary mb-3 text-lg font-semibold">
                    Hôtels similaires
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {similarHotels.map((alt) => {
                      const altQs = new URLSearchParams(searchParams.toString())
                      const href = `/hotels/${alt.id}?${altQs.toString()}`
                      // PHASE 30.3 — étiquette DÉTERMINISTE, jamais un score
                      // inventé : compare deux champs réels déjà chargés
                      // (prix affiché, étoiles) de cette alternative contre
                      // l'hôtel courant. "Moins cher" prioritaire sur "Même
                      // catégorie" (plus déterminant pour la décision) — une
                      // seule étiquette à la fois pour ne pas surcharger.
                      const comparisonLabel =
                        cardShape && alt.discountedPrice < cardShape.discountedPrice
                          ? "Moins cher"
                          : cardShape && alt.stars === cardShape.stars && alt.stars > 0
                            ? "Même catégorie"
                            : null
                      return (
                        <Link
                          key={alt.id}
                          href={href}
                          className="border-border bg-card hover:border-primary/50 flex gap-3 rounded-lg border p-3 transition-colors"
                        >
                          <div
                            className="h-20 w-20 shrink-0 rounded-md bg-cover bg-center"
                            style={{ backgroundImage: `url(${alt.images[0]})` }}
                            role="img"
                            aria-label={`Photo de ${alt.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-foreground truncate text-sm font-medium">
                                {alt.name}
                              </p>
                              {comparisonLabel && (
                                <span className="bg-secondary/30 text-primary shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                                  {comparisonLabel}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-0.5">
                              {Array.from({ length: alt.stars }).map((_, i) => (
                                <Star
                                  key={i}
                                  className="h-3 w-3 fill-amber-400 text-amber-400"
                                />
                              ))}
                            </div>
                            <p className="text-muted-foreground mt-1 truncate text-xs">
                              {alt.location}
                            </p>
                            <p className="text-primary mt-1 text-sm font-semibold">
                              À partir de {format(alt.discountedPrice)}
                            </p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              )
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="bg-card border-border space-y-4 rounded-lg border p-5">
              {/* PHASE 30.3 — point d'entrée prix dans la zone de décision
                  sticky (audit : absent jusqu'ici, le prix n'apparaissait
                  qu'en scrollant jusqu'à "Chambres et tarifs") — seulement
                  quand un prix réel est chargé (cardShape), jamais avant.
                  PHASE 32 — reflète la chambre RÉELLEMENT sélectionnée par
                  le client dans la liste ci-dessus quand il y en a une
                  (même prix/pension/annulation, jamais une seconde
                  logique) ; repli sur le prix générique "à partir de"
                  sinon. */}
              {effectiveSelectedRoom ? (
                <div>
                  <p className="text-muted-foreground text-xs">
                    Chambre sélectionnée
                  </p>
                  <p className="text-foreground mt-1 text-sm font-medium">
                    {effectiveSelectedRoom.name}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                    <UtensilsCrossed className="h-3 w-3" />
                    {effectiveSelectedRoom.boardingName}
                  </p>
                  {effectiveSelectedRoom.cancellation === "FREE" && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <ShieldCheck className="h-3 w-3" />
                      Annulation gratuite
                    </p>
                  )}
                  <p className="text-primary mt-1.5 text-2xl font-bold">
                    {format(effectiveSelectedRoom.price)}
                  </p>
                </div>
              ) : cardShape ? (
                <div>
                  <p className="text-muted-foreground text-xs">À partir de</p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    {cardShape.discountPercent > 0 && (
                      <span className="text-muted-foreground text-sm line-through">
                        {format(cardShape.originalPrice)}
                      </span>
                    )}
                    <span className="text-primary text-2xl font-bold">
                      {format(cardShape.discountedPrice)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {cardShape.mealPlan}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground text-xs">
                    Vérifier les tarifs
                  </p>
                  <p className="text-foreground mt-1 text-sm">
                    {checkin && checkout
                      ? "Pour vos dates et voyageurs sélectionnés"
                      : "Choisissez vos dates pour voir les disponibilités"}
                  </p>
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleCheckAvailability}
                size="lg"
              >
                <Calendar className="h-4 w-4" />
                {roomsEffectiveStatus === "success"
                  ? "Voir les chambres disponibles"
                  : checkin && checkout
                    ? "Voir les disponibilités"
                    : "Choisir mes dates"}
              </Button>

              {(hotel.email || hotel.phone) && (
                <div className="border-border space-y-2 border-t pt-4">
                  <h3 className="text-primary text-sm font-semibold">
                    Contact
                  </h3>
                  {hotel.email && (
                    <a
                      href={`mailto:${hotel.email}`}
                      className="text-foreground hover:text-primary flex items-center gap-2 text-sm transition-colors"
                    >
                      <Mail className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="truncate">{hotel.email}</span>
                    </a>
                  )}
                  {hotel.phone && (
                    <a
                      href={`tel:${hotel.phone}`}
                      className="text-foreground hover:text-primary flex items-center gap-2 text-sm transition-colors"
                    >
                      <Phone className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span>{hotel.phone}</span>
                    </a>
                  )}
                </div>
              )}

              {hotel.latitude && hotel.longitude && (
                <div className="border-border border-t pt-4">
                  <h3 className="text-primary mb-2 text-sm font-semibold">
                    Localisation
                  </h3>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                  >
                    <MapPin className="h-4 w-4" />
                    Voir sur Google Maps
                  </a>
                </div>
              )}
            </div>
          </aside>
        </div>

        <ProductReviewsSectionClient module="hotel" productRef={String(hotel.id)} />
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
      <div className="bg-muted group relative h-72 w-full overflow-hidden rounded-lg md:h-96">
        <div
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${safe[idx]})` }}
          role="img"
          aria-label="Photo principale de l'hôtel"
        />

        {safe.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="bg-card/90 hover:bg-card absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
              aria-label="Photo précédente"
            >
              <ChevronLeft className="text-foreground h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="bg-card/90 hover:bg-card absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
              aria-label="Photo suivante"
            >
              <ChevronRight className="text-foreground h-5 w-5" />
            </button>
            <div className="bg-card/80 text-foreground absolute right-3 bottom-3 rounded-full px-2 py-1 text-xs">
              {idx + 1} / {safe.length}
            </div>
          </>
        )}
      </div>

      {safe.length > 1 && (
        // PHASE 30 — 4 colonnes sur mobile (au lieu de 6, cibles tactiles trop
        // petites, trouvé pendant l'audit), 6 à partir de sm.
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {safe.slice(0, 6).map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={`relative aspect-square overflow-hidden rounded-md border-2 transition-colors ${
                i === idx ? "border-primary" : "border-transparent"
              }`}
              aria-label={`Voir la photo ${i + 1}`}
            >
              <div
                className="h-full w-full bg-cover bg-center"
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
    <div className="bg-background min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-72 w-full rounded-lg md:h-96" />
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
