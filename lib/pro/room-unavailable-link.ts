/**
 * PHASE 30.4 — extrait de `app/pro/(app)/booking/travelers/page.tsx`
 * (`UnavailableState`) pour rester testable sans rendu React : construit le
 * lien "Retour aux chambres" affiché quand la chambre sélectionnée n'est
 * plus disponible/valide.
 *
 * Audit Phase 30.4 : 2 des 3 sites d'appel omettaient `cityId`/`adults`
 * alors qu'ils étaient déjà connus à ce stade — `/pro/hotels/[id]` EXIGE
 * `cityId` (sinon écran "Recherche incomplète") donc ce lien n'y ramenait
 * jamais réellement l'agent. Fonction pure : ne fait que sérialiser les
 * paramètres déjà connus, jamais une nouvelle résolution/recherche.
 */
export function buildUnavailableRoomBackHref(
  hotelId: string,
  params: {
    cityId?: string
    checkin?: string
    checkout?: string
    adults?: string
  },
): string {
  const qs = new URLSearchParams()
  if (params.cityId) qs.set("cityId", params.cityId)
  if (params.checkin) qs.set("checkin", params.checkin)
  if (params.checkout) qs.set("checkout", params.checkout)
  if (params.adults) qs.set("adults", params.adults)
  return `/pro/hotels/${hotelId}?${qs.toString()}`
}
