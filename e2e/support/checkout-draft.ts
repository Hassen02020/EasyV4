/**
 * Aides e2e pour le tunnel de réservation hôtel (DRAFT-PII-URL-01/02).
 *
 * Données de TEST uniquement : aucun appel fournisseur. Le `priceToken` est
 * signé avec PRICE_TOKEN_SECRET (le même secret que le serveur de test : en
 * CI, variable globale du workflow ; en local, la valeur de dev par défaut).
 */
import type { BrowserContext } from "@playwright/test"
import { signHotelPriceToken } from "../../lib/booking/price-token"
import {
  newTravelerRef,
  sealTraveler,
  travelerCookieName,
  TRAVELER_COOKIE_TTL_MS,
} from "../../lib/booking/traveler-cookie"

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

export const TEST_TRAVELER = {
  civility: "M" as const,
  firstName: "Sami",
  lastName: "Test",
  email: "sami-e2e-test@example.com",
  phone: "+216 98 123 456",
  civicIdType: "cin" as const,
  civicId: "12345678",
}

const HOTEL = {
  hotelId: 500001,
  roomId: 1,
  boardingId: 1,
  checkin: "2026-09-10",
  checkout: "2026-09-13",
  adults: 2,
  currency: "TND",
  unitPriceTnd: 250,
}

function toToken(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url")
}

/** Brouillon hôtel de test ; `signed` ajoute un priceToken serveur valide. */
export function draftPayload(signed: boolean) {
  const metadata: Record<string, unknown> = {
    hotelId: HOTEL.hotelId,
    cityId: 1,
    boardingId: HOTEL.boardingId,
    roomId: HOTEL.roomId,
    myGoToken: "dummy-token",
  }
  if (signed) metadata.priceToken = signHotelPriceToken(HOTEL)
  return {
    draft: {
      module: "hotel",
      offerId: "500001-1-1",
      offerLabel: "Hôtel Test — Chambre Double",
      startDate: HOTEL.checkin,
      endDate: HOTEL.checkout,
      adults: HOTEL.adults,
      children: 0,
      unitPriceTnd: HOTEL.unitPriceTnd,
      currency: HOTEL.currency,
      metadata,
    },
  }
}

export const draftToken = (signed: boolean) => toToken(draftPayload(signed))

/** Ancien format d'URL : voyageur encodé dans `?d=` (n'est plus lu). */
export const legacyTokenWithTraveler = () =>
  toToken({ ...draftPayload(true), traveler: TEST_TRAVELER })

/** Pose un cookie voyageur chiffré valide (ou daté) et renvoie sa référence. */
export async function addTravelerCookie(
  context: BrowserContext,
  opts: { ageMs?: number; tamper?: boolean } = {},
): Promise<string> {
  const ref = newTravelerRef()
  const issuedAt = Date.now() - (opts.ageMs ?? 0)
  let value = sealTraveler(ref, TEST_TRAVELER, issuedAt)
  if (opts.tamper) {
    const raw = Buffer.from(value, "base64url")
    raw[raw.length - 1] ^= 1
    value = raw.toString("base64url")
  }
  await context.addCookies([
    {
      name: travelerCookieName(ref),
      value,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
  return ref
}

export const EXPIRED_AGE_MS = TRAVELER_COOKIE_TTL_MS + 60_000
