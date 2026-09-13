/**
 * Éligibilité voucher hôtel — extrait de
 * `app/api/pro/reservations/[id]/voucher/route.ts` pour être testable
 * (les fichiers `route.ts` de l'App Router ne doivent exporter que les
 * handlers HTTP reconnus, voir convention déjà en place sur les autres
 * routes de ce repo).
 *
 * Un voucher atteste qu'un séjour est réellement confirmé auprès du
 * fournisseur (et payé — le wallet n'est débité qu'après confirmation
 * réussie, voir `lib/booking/actions.ts::createReservationFromDraft`).
 * Sans ce filtre, une réservation encore `pending`/`on_request` ou déjà
 * `cancelled`/`refunded` produisait un PDF identique à celui d'une
 * réservation réellement confirmée — trouvé en audit Phase 11.
 */

export interface VoucherEligibilityInput {
  module: string
  status: string
  hotelName: string | null | undefined
  checkIn: string | null | undefined
  checkOut: string | null | undefined
}

/** Statuts pour lesquels un voucher hôtel peut être régénéré à la demande. */
const VOUCHER_ELIGIBLE_STATUSES = new Set(["confirmed", "completed"])

export function isVoucherEligible(
  row: VoucherEligibilityInput,
): row is VoucherEligibilityInput & { hotelName: string; checkIn: string; checkOut: string } {
  if (row.module !== "hotel") return false
  if (!row.hotelName || !row.checkIn || !row.checkOut) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/**
 * Éligibilité voucher Omra — même règle que `isVoucherEligible` ci-dessus
 * (Phase 11 : `confirmed`/`completed` uniquement, jamais `pending` ni
 * `cancelled`/`refunded`), fonction dédiée plutôt qu'une extension de
 * `isVoucherEligible` pour ne jamais toucher au garde déjà audité et validé
 * en Phase 11 (RÈGLE ABSOLUE Phase 12 : ne pas réécrire un correctif déjà
 * validé).
 */
export interface OmraVoucherEligibilityInput {
  module: string
  status: string
  packageName: string | null | undefined
  departureDate: string | null | undefined
  returnDate: string | null | undefined
}

export function isOmraVoucherEligible(
  row: OmraVoucherEligibilityInput,
): row is OmraVoucherEligibilityInput & { packageName: string; departureDate: string; returnDate: string } {
  if (row.module !== "omra") return false
  if (!row.packageName || !row.departureDate || !row.returnDate) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/** Éligibilité voucher Voyage Organisé (Package) — même règle, fonction dédiée. */
export interface PackageVoucherEligibilityInput {
  module: string
  status: string
  packageName: string | null | undefined
  departureDate: string | null | undefined
  returnDate: string | null | undefined
}

export function isPackageVoucherEligible(
  row: PackageVoucherEligibilityInput,
): row is PackageVoucherEligibilityInput & { packageName: string; departureDate: string; returnDate: string } {
  if (row.module !== "package") return false
  if (!row.packageName || !row.departureDate || !row.returnDate) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/** Éligibilité voucher Attraction (Phase 13.1) — même règle, fonction dédiée. */
export interface ActivityVoucherEligibilityInput {
  module: string
  status: string
  activityName: string | null | undefined
  sessionDate: string | null | undefined
}

export function isActivityVoucherEligible(
  row: ActivityVoucherEligibilityInput,
): row is ActivityVoucherEligibilityInput & { activityName: string; sessionDate: string } {
  if (row.module !== "activity") return false
  if (!row.activityName || !row.sessionDate) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/** Éligibilité voucher Vol — même règle, fonction dédiée. */
export interface FlightVoucherEligibilityInput {
  module: string
  status: string
  origin: string | null | undefined
  destination: string | null | undefined
  departAt: string | null | undefined
}

export function isFlightVoucherEligible(
  row: FlightVoucherEligibilityInput,
): row is FlightVoucherEligibilityInput & { origin: string; destination: string; departAt: string } {
  if (row.module !== "flight") return false
  if (!row.origin || !row.destination || !row.departAt) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/**
 * Éligibilité voucher Hôtels Monde — même règle (Phase 11 :
 * `confirmed`/`completed` uniquement), fonction dédiée plutôt qu'une
 * extension de `isVoucherEligible` : les deux réutilisent la même table
 * d'extension `reservation_hotel` (voir
 * drizzle/manual/0051_hotel_monde_module.sql) mais restent deux modules
 * distincts (`"hotel"` vs `"hotel_monde"`) — jamais un voucher Hôtels Monde
 * émis pour une ligne `"hotel"` ou inversement.
 */
export interface WorldHotelVoucherEligibilityInput {
  module: string
  status: string
  hotelName: string | null | undefined
  checkIn: string | null | undefined
  checkOut: string | null | undefined
}

export function isWorldHotelVoucherEligible(
  row: WorldHotelVoucherEligibilityInput,
): row is WorldHotelVoucherEligibilityInput & { hotelName: string; checkIn: string; checkOut: string } {
  if (row.module !== "hotel_monde") return false
  if (!row.hotelName || !row.checkIn || !row.checkOut) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/**
 * PHASE 38B (Voucher Hardening) — SEULE source de vérité pour "quelle route
 * de téléchargement voucher pour quel module ?". Avant cette extraction,
 * deux copies indépendantes de cette table existaient
 * (`app/booking/confirmation/[ref]/page.tsx` et
 * `components/booking-summary-card.tsx`) et avaient déjà divergé : la
 * première omettait `activity` (son fallback `?? "/api/booking/voucher"`
 * routait silencieusement une confirmation Activity vers le PDF hôtel, qui
 * la rejette), la seconde n'autorisait QUE `hotel` alors que les routes
 * Omra/Package/Activity existent et fonctionnent déjà — un client avec une
 * réservation confirmée dans l'un de ces 3 modules voyait un bouton
 * "Voucher PDF" désactivé en permanence sur `/compte` sans raison
 * technique. Une seule table désormais, réutilisée aux deux endroits.
 */
export const VOUCHER_ROUTE_BY_MODULE: Record<string, string> = {
  hotel: "/api/booking/voucher",
  omra: "/api/omra/voucher",
  package: "/api/packages/voucher",
  activity: "/api/activities/voucher",
  flight: "/api/vols/voucher",
  hotel_monde: "/api/hotels-monde/voucher",
}

/**
 * Éligibilité voucher hôtel spécifiquement — conservée telle quelle (règle
 * déjà validée par tests, ne jamais la réécrire). N'est plus la SEULE
 * fonction utilisée par les écrans détail Admin/Pro depuis que
 * `/api/admin/.../voucher` et `/api/pro/.../voucher` dispatchent par module
 * (voir `lib/booking/reservation-voucher-render.ts`) — pour ces deux
 * écrans, préférer `isAdminReservationVoucherEligible` ci-dessous, qui
 * couvre les 6 modules réservables.
 */
export function isHotelReservationVoucherEligible(module: string, status: string): boolean {
  return module === "hotel" && VOUCHER_ELIGIBLE_STATUSES.has(status)
}

/**
 * Éligibilité voucher pour les écrans détail Admin/Pro
 * (`ReservationDetailView`, `/api/admin/.../voucher` et
 * `/api/pro/.../voucher`) — ces deux routes dispatchent désormais par
 * module (voir `lib/booking/reservation-voucher-render.ts`), réutilisant
 * exactement les mêmes renderers/éligibilités que les routes guest
 * publiques `/api/{module}/voucher/[ref]`. Avant ce fix (trouvé en
 * certification E2E, cycle "Final Screenshot Certification"), ces deux
 * écrans utilisaient `isHotelReservationVoucherEligible` seule, qui ne
 * renvoie jamais `true` pour un module autre que "hotel" — le lien
 * "Télécharger" du bloc Voucher restait donc invisible pour Omra/Package/
 * Activité/Vols/Hôtels Monde même confirmés.
 *
 * Sert uniquement à décider d'afficher ou non le lien "Télécharger" AVANT
 * même d'appeler la route : sans ce garde, le lien resterait affiché (et
 * cliquable) pour une réservation `cancelled`/`pending` alors que la route
 * le refuse déjà (404 `voucher_unavailable`) — un lien qui échoue toujours
 * n'est pas "invalide après annulation", c'est un lien resté affiché par
 * erreur (même raisonnement Phase 11 que `isVoucherEligible`).
 */
export function isAdminReservationVoucherEligible(module: string, status: string): boolean {
  return module in VOUCHER_ROUTE_BY_MODULE && VOUCHER_ELIGIBLE_STATUSES.has(status)
}

/**
 * Construit le lien de téléchargement voucher pour un module donné, ou
 * `null` si ce module n'a pas de route voucher (vol/transfert/voiture —
 * jamais un lien fabriqué vers une route qui n'existe pas).
 */
export function voucherHrefForModule(
  module: string,
  publicRef: string,
  token: string,
): string | null {
  const base = VOUCHER_ROUTE_BY_MODULE[module]
  if (!base) return null
  return `${base}/${publicRef}?token=${token}`
}
