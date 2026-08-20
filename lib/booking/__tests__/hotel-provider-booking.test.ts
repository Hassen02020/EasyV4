import test from "node:test"
import assert from "node:assert/strict"
import type { BookingDraft, TravelerInput } from "../schemas"
import {
  MyGoApiError,
  MyGoAuthError,
  MyGoCircuitOpenError,
  MyGoNetworkError,
  MyGoSchemaError,
  MyGoTimeoutError,
} from "@/lib/mygo"
import {
  authoritativeUnitPrice,
  bookingConfirmationMatchesExpectedHotel,
  buildMyGoBookingRequest,
  classifyMyGoBookingError,
  describeMyGoBookingErrorForUser,
  describeMyGoCancellationErrorForUser,
  extractHotelProviderMetadata,
  isAmbiguousBookingError,
  parseMyGoTimestamp,
  reconcileAmbiguousBooking,
} from "../hotel-provider-booking"

const traveler: TravelerInput = {
  civility: "M",
  firstName: "Ahmed",
  lastName: "Ben Salah",
  email: "ahmed@example.tn",
  phone: "+216 98 140 514",
  civicIdType: "cin",
  civicId: "12345678",
}

const baseDraft: BookingDraft = {
  module: "hotel",
  offerId: "646",
  offerLabel: "Yocca Hotel Residence — Chambre Double",
  startDate: "2026-09-10",
  endDate: "2026-09-13",
  adults: 1,
  children: 0,
  unitPriceTnd: 651,
  currency: "TND",
  metadata: {
    myGoToken: "tok-abc123",
    cityId: 10,
    hotelId: 646,
    boardingId: 5,
    boardingCode: "DP",
    roomId: 5521,
    childrenAges: [],
  },
}

test("extractHotelProviderMetadata: metadata myGo complète → objet validé", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)
  assert.ok(meta)
  assert.equal(meta!.myGoToken, "tok-abc123")
  assert.equal(meta!.cityId, 10)
  assert.equal(meta!.roomId, 5521)
})

test("extractHotelProviderMetadata: metadata absente → null (offre démo)", () => {
  assert.equal(extractHotelProviderMetadata(undefined), null)
  assert.equal(
    extractHotelProviderMetadata({ hotelImage: "x.jpg", mealPlan: "DP" }),
    null,
  )
})

test("extractHotelProviderMetadata: champs requis manquants → null", () => {
  const incomplete = { ...(baseDraft.metadata as Record<string, unknown>) }
  delete incomplete.myGoToken
  assert.equal(extractHotelProviderMetadata(incomplete), null)
})

test("buildMyGoBookingRequest: voyageur principal = Holder avec sa vraie identité", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  const req = buildMyGoBookingRequest({ draft: baseDraft, traveler, providerMeta: meta })
  assert.equal(req.token, "tok-abc123")
  assert.equal(req.cityId, 10)
  assert.equal(req.hotelId, 646)
  assert.equal(req.checkIn, "2026-09-10")
  assert.equal(req.checkOut, "2026-09-13")
  assert.equal(req.rooms.length, 1)
  const room = req.rooms[0]!
  assert.equal(room.roomId, 5521)
  assert.equal(room.boardingId, 5)
  assert.equal(room.adults.length, 1)
  const holder = room.adults[0]!
  assert.equal(holder.holder, true)
  assert.equal(holder.name, "Ahmed")
  assert.equal(holder.surname, "Ben Salah")
  assert.equal(holder.civility, "M")
  assert.equal(room.children, undefined)
})

test("buildMyGoBookingRequest: adultes additionnels génériques, non-Holder", () => {
  const draft: BookingDraft = { ...baseDraft, adults: 3 }
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  const req = buildMyGoBookingRequest({ draft, traveler, providerMeta: meta })
  const adults = req.rooms[0]!.adults
  assert.equal(adults.length, 3)
  assert.equal(adults[0]!.holder, true)
  assert.equal(adults[1]!.holder, false)
  assert.equal(adults[1]!.surname, "Ben Salah")
  assert.equal(adults[2]!.holder, false)
  assert.notEqual(adults[1]!.name, adults[2]!.name)
})

test("buildMyGoBookingRequest: âges enfants réels repris depuis les métadonnées", () => {
  const draft: BookingDraft = { ...baseDraft, children: 2 }
  const metaRaw = { ...(baseDraft.metadata as Record<string, unknown>), childrenAges: [5, 9] }
  const meta = extractHotelProviderMetadata(metaRaw)!
  const req = buildMyGoBookingRequest({ draft, traveler, providerMeta: meta })
  const children = req.rooms[0]!.children!
  assert.equal(children.length, 2)
  assert.equal(children[0]!.age, 5)
  assert.equal(children[1]!.age, 9)
  assert.equal(children[0]!.surname, "Ben Salah")
})

test("buildMyGoBookingRequest: âge par défaut si liste d'âges plus courte que le nombre d'enfants", () => {
  const draft: BookingDraft = { ...baseDraft, children: 2 }
  const metaRaw = { ...(baseDraft.metadata as Record<string, unknown>), childrenAges: [7] }
  const meta = extractHotelProviderMetadata(metaRaw)!
  const req = buildMyGoBookingRequest({ draft, traveler, providerMeta: meta })
  const children = req.rooms[0]!.children!
  assert.equal(children[0]!.age, 7)
  assert.equal(children[1]!.age, 10) // fallback
})

test("buildMyGoBookingRequest: hotelId retombe sur draft.offerId si absent des métadonnées", () => {
  const metaRaw = { ...(baseDraft.metadata as Record<string, unknown>) }
  delete metaRaw.hotelId
  const meta = extractHotelProviderMetadata(metaRaw)!
  const req = buildMyGoBookingRequest({ draft: baseDraft, traveler, providerMeta: meta })
  assert.equal(req.hotelId, 646) // Number(draft.offerId)
})

test("authoritativeUnitPrice: répartit le total myGo sur les adultes, enfants à 0", () => {
  const r = authoritativeUnitPrice(651, 3)
  assert.equal(r.unitPriceTnd, 217)
  assert.equal(r.unitChildPriceTnd, 0)
})

test("authoritativeUnitPrice: protège contre adults=0", () => {
  const r = authoritativeUnitPrice(500, 0)
  assert.equal(r.unitPriceTnd, 500)
})

// ---------------------------------------------------------------------------
// Régression sécurité — prix tampering
// ---------------------------------------------------------------------------

test("SÉCURITÉ — prix client 100 TND ignoré, total myGo 850 TND fait foi", () => {
  // Simule ce que fait lib/booking/actions.ts : draft.unitPriceTnd (client,
  // non signé) est TOTALEMENT ignoré dès qu'un booking myGo existe — seul
  // authoritativeUnitPrice(myGoBooking.totalPrice, ...) alimente le pricing.
  const clientSubmittedUnitPrice = 100 // valeur falsifiée côté client
  const myGoAuthoritativeTotal = 850
  const adults = 1

  const reconciled = authoritativeUnitPrice(myGoAuthoritativeTotal, adults)
  assert.notEqual(reconciled.unitPriceTnd, clientSubmittedUnitPrice)
  assert.equal(reconciled.unitPriceTnd, 850)
  assert.equal(reconciled.unitChildPriceTnd, 0)
})

test("SÉCURITÉ — buildMyGoBookingRequest n'expose aucun champ currency (forcé TND côté client myGo)", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  const req = buildMyGoBookingRequest({ draft: baseDraft, traveler, providerMeta: meta })
  assert.equal("currency" in req, false)
})

// ---------------------------------------------------------------------------
// Classification des erreurs
// ---------------------------------------------------------------------------

test("classifyMyGoBookingError: distingue chaque type d'erreur myGo", () => {
  assert.equal(
    classifyMyGoBookingError(new MyGoAuthError("bad creds")),
    "AUTHENTICATION_ERROR",
  )
  assert.equal(
    classifyMyGoBookingError(new MyGoTimeoutError(8000)),
    "TIMEOUT",
  )
  assert.equal(
    classifyMyGoBookingError(new MyGoNetworkError("ECONNRESET")),
    "NETWORK_ERROR",
  )
  assert.equal(
    classifyMyGoBookingError(new MyGoSchemaError("BookingCreation", [])),
    "MALFORMED_RESPONSE",
  )
  assert.equal(
    classifyMyGoBookingError(new MyGoCircuitOpenError(new Date())),
    "CIRCUIT_OPEN",
  )
  assert.equal(classifyMyGoBookingError(new Error("???")), "UNKNOWN_ERROR")
})

test("classifyMyGoBookingError: heuristique prix/disponibilité sur MyGoApiError", () => {
  assert.equal(
    classifyMyGoBookingError(
      new MyGoApiError("BookingCreation", 12, "Price has changed"),
    ),
    "PRICE_CHANGED",
  )
  assert.equal(
    classifyMyGoBookingError(
      new MyGoApiError("BookingCreation", 13, "No availability for this room"),
    ),
    "NO_AVAILABILITY",
  )
  assert.equal(
    classifyMyGoBookingError(
      new MyGoApiError("BookingCreation", 99, "Something else entirely"),
    ),
    "MYGO_BUSINESS_ERROR",
  )
})

test("isAmbiguousBookingError: seules les erreurs réseau/timeout/malformées sont ambiguës", () => {
  assert.equal(isAmbiguousBookingError("TIMEOUT"), true)
  assert.equal(isAmbiguousBookingError("NETWORK_ERROR"), true)
  assert.equal(isAmbiguousBookingError("MALFORMED_RESPONSE"), true)
  assert.equal(isAmbiguousBookingError("MYGO_BUSINESS_ERROR"), false)
  assert.equal(isAmbiguousBookingError("AUTHENTICATION_ERROR"), false)
  assert.equal(isAmbiguousBookingError("CIRCUIT_OPEN"), false)
  assert.equal(isAmbiguousBookingError("AMBIGUOUS_SUPPLIER_STATE"), false)
})

test("describeMyGoBookingErrorForUser / describeMyGoCancellationErrorForUser: jamais vide, jamais de détail technique brut", () => {
  const kinds = [
    "NETWORK_ERROR",
    "TIMEOUT",
    "AUTHENTICATION_ERROR",
    "MYGO_BUSINESS_ERROR",
    "NO_AVAILABILITY",
    "PRICE_CHANGED",
    "MALFORMED_RESPONSE",
    "CIRCUIT_OPEN",
    "AMBIGUOUS_SUPPLIER_STATE",
    "UNKNOWN_ERROR",
  ] as const
  for (const k of kinds) {
    const msg = describeMyGoBookingErrorForUser(k)
    assert.ok(msg.length > 0)
    assert.doesNotMatch(msg, /Credential|Login|Password|xml|json/i)
    const cancelMsg = describeMyGoCancellationErrorForUser(k)
    assert.ok(cancelMsg.length > 0)
  }
})

// ---------------------------------------------------------------------------
// Réconciliation après échec ambigu (timeout/réseau)
// ---------------------------------------------------------------------------

test("parseMyGoTimestamp: parse le format myGo 'YYYY-MM-DD HH24:MI'", () => {
  const t = parseMyGoTimestamp("2026-08-20 10:15")
  assert.ok(t !== null)
  assert.equal(new Date(t!).getUTCFullYear(), 2026)
})

test("parseMyGoTimestamp: chaîne invalide → null", () => {
  assert.equal(parseMyGoTimestamp("not-a-date"), null)
})

const NOW = new Date("2026-08-20T10:20:00Z").getTime()

test("reconcileAmbiguousBooking: aucun candidat → null (pas de réservation trouvée)", () => {
  const match = reconcileAmbiguousBooking(
    [],
    { hotelId: 646, checkIn: "2026-09-10", checkOut: "2026-09-13" },
    NOW,
  )
  assert.equal(match, null)
})

test("reconcileAmbiguousBooking: un candidat récent unique et correspondant → adopté", () => {
  const match = reconcileAmbiguousBooking(
    [
      {
        bookingId: 918273,
        hotelId: 646,
        checkIn: "2026-09-10",
        checkOut: "2026-09-13",
        state: "Validated",
        createdAt: "2026-08-20 10:18", // 2 min avant NOW
      },
    ],
    { hotelId: 646, checkIn: "2026-09-10", checkOut: "2026-09-13" },
    NOW,
  )
  assert.ok(match)
  assert.equal(match!.bookingId, 918273)
})

test("SÉCURITÉ — reconcileAmbiguousBooking: DEUX candidats plausibles → refuse de deviner (null)", () => {
  const candidates = [
    {
      bookingId: 111,
      hotelId: 646,
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      state: "Validated",
      createdAt: "2026-08-20 10:17",
    },
    {
      bookingId: 222,
      hotelId: 646,
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      state: "Validated",
      createdAt: "2026-08-20 10:19",
    },
  ]
  const match = reconcileAmbiguousBooking(
    candidates,
    { hotelId: 646, checkIn: "2026-09-10", checkOut: "2026-09-13" },
    NOW,
  )
  assert.equal(match, null, "ambiguïté non résolue -> jamais d'adoption silencieuse")
})

test("reconcileAmbiguousBooking: candidat hors fenêtre temporelle → null", () => {
  const match = reconcileAmbiguousBooking(
    [
      {
        bookingId: 918273,
        hotelId: 646,
        checkIn: "2026-09-10",
        checkOut: "2026-09-13",
        state: "Validated",
        createdAt: "2026-08-19 10:00", // > 24h avant NOW, hors fenêtre 10 min
      },
    ],
    { hotelId: 646, checkIn: "2026-09-10", checkOut: "2026-09-13" },
    NOW,
  )
  assert.equal(match, null)
})

test("reconcileAmbiguousBooking: candidat annulé ignoré même s'il correspond", () => {
  const match = reconcileAmbiguousBooking(
    [
      {
        bookingId: 918273,
        hotelId: 646,
        checkIn: "2026-09-10",
        checkOut: "2026-09-13",
        state: "Cancelled",
        createdAt: "2026-08-20 10:18",
      },
    ],
    { hotelId: 646, checkIn: "2026-09-10", checkOut: "2026-09-13" },
    NOW,
  )
  assert.equal(match, null)
})

test("reconcileAmbiguousBooking: hôtel/dates différents ignorés", () => {
  const match = reconcileAmbiguousBooking(
    [
      {
        bookingId: 918273,
        hotelId: 999, // hôtel différent
        checkIn: "2026-09-10",
        checkOut: "2026-09-13",
        state: "Validated",
        createdAt: "2026-08-20 10:18",
      },
    ],
    { hotelId: 646, checkIn: "2026-09-10", checkOut: "2026-09-13" },
    NOW,
  )
  assert.equal(match, null)
})

// ---------------------------------------------------------------------------
// Cohérence hôtel confirmé vs. attendu
// ---------------------------------------------------------------------------

test("bookingConfirmationMatchesExpectedHotel: hotelId identique → true", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  assert.equal(
    bookingConfirmationMatchesExpectedHotel({ hotelId: 646 }, meta),
    true,
  )
})

test("SÉCURITÉ — bookingConfirmationMatchesExpectedHotel: hotelId différent → false", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  assert.equal(
    bookingConfirmationMatchesExpectedHotel({ hotelId: 999 }, meta),
    false,
  )
})

test("bookingConfirmationMatchesExpectedHotel: champ absent d'un côté → true (permissif)", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  assert.equal(bookingConfirmationMatchesExpectedHotel({}, meta), true)
})
