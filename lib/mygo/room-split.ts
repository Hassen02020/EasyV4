/**
 * Répartition multi-chambres — pure, testable, sans I/O.
 *
 * Le connecteur myGo accepte nativement `rooms: {adults, childAges}[]`
 * (voir `HotelSearchInput` dans lib/mygo/client.ts, `SearchDetails.Rooms`
 * dans la requête réelle) : ce module ne fait qu'exposer proprement une
 * capacité déjà réelle et déjà supportée par le fournisseur, jamais une
 * fonctionnalité fictive.
 */

export interface RoomSplit {
  adults: number
  childAges?: number[]
}

/**
 * Répartit `totalAdults` adultes et les âges enfants sur `roomsCount`
 * chambres (au moins 1 adulte par chambre — myGo n'accepte pas de chambre
 * à 0 adulte). Répartition équitable (le reste va aux premières chambres),
 * âges enfants assignés en tourniquet.
 */
export function splitIntoRooms(
  roomsCount: number,
  totalAdults: number,
  childAges: number[],
): RoomSplit[] {
  const safeRoomsCount = Math.max(1, Math.floor(roomsCount))
  const base = Math.floor(totalAdults / safeRoomsCount)
  let remainder = totalAdults % safeRoomsCount
  const result: RoomSplit[] = Array.from({ length: safeRoomsCount }, () => {
    let adults = base
    if (remainder > 0) {
      adults += 1
      remainder -= 1
    }
    return { adults: Math.max(1, adults) }
  })
  childAges.forEach((age, i) => {
    const room = result[i % result.length]
    room.childAges = room.childAges ? [...room.childAges, age] : [age]
  })
  return result
}

/** Encode compact pour l'URL : "adultes-age1.age2|adultes|...". */
export function encodeRoomsParam(rooms: RoomSplit[]): string {
  return rooms
    .map((r) =>
      r.childAges?.length ? `${r.adults}-${r.childAges.join(".")}` : `${r.adults}`,
    )
    .join("|")
}

/** Décode l'encodage compact ci-dessus (même logique que le parsing côté
 * app/api/hotels/search/route.ts — dupliquée intentionnellement en pur côté
 * lib pour rester testable sans dépendre de Zod/NextRequest). */
export function decodeRoomsParam(value: string): RoomSplit[] {
  return value
    .split("|")
    .filter(Boolean)
    .slice(0, 8)
    .map((segment) => {
      const [adultsStr, agesStr] = segment.split("-")
      const adults = Math.min(6, Math.max(1, parseInt(adultsStr, 10) || 1))
      const childAges = agesStr
        ? agesStr
            .split(".")
            .map((a) => parseInt(a, 10))
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17)
        : []
      return childAges.length > 0 ? { adults, childAges } : { adults }
    })
}
