/**
 * POST /api/flights/search
 *
 * Recherche de vols via le client GDS avec application des marges.
 * Retourne les vols disponibles avec les prix de vente calculés (Prix_Achat + Marge).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getGdsClient, FlightApiError, FlightSearchSchema } from "@/lib/flights/gds-client"
import { calculateSellingPrice } from "@/lib/yield/margin-engine"
import type { Flight } from "@/lib/flights/gds-client"

export const dynamic = "force-dynamic"

/**
 * Applique les marges sur les vols
 */
async function applyMargins(flights: Flight[]): Promise<Flight[]> {
  return Promise.all(
    flights.map(async (flight) => {
      try {
        const priceCalc = await calculateSellingPrice(
          flight.price.amount,
          flight.price.currency,
          "flight",
        )
        
        return {
          ...flight,
          price: {
            ...flight.price,
            // Prix d'achat fournisseur (conservé pour référence)
            costPrice: flight.price.amount,
            // Prix de vente avec marge (affiché au client)
            amount: priceCalc.sellingPriceTnd,
            currency: "TND",
            // Métadonnées de calcul
            _pricing: {
              originalAmount: flight.price.amount,
              originalCurrency: flight.price.currency,
              marginPercentage: priceCalc.marginPercentage,
              marginAmount: priceCalc.marginAmount,
            },
          },
        }
      } catch (error) {
        console.error("Erreur calcul marge pour vol:", flight.flightId, error)
        // En cas d'erreur, retourner le vol sans modification
        return flight
      }
    }),
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Validation des paramètres
    const parsed = FlightSearchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_params", issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const params = parsed.data

    // Validation des dates
    const departureDate = new Date(params.departureDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (departureDate < today) {
      return NextResponse.json(
        { error: "invalid_dates", message: "La date de départ doit être dans le futur" },
        { status: 400 },
      )
    }

    if (params.returnDate) {
      const returnDate = new Date(params.returnDate)
      if (returnDate <= departureDate) {
        return NextResponse.json(
          { error: "invalid_dates", message: "La date de retour doit être après la date de départ" },
          { status: 400 },
        )
      }
    }

    // Recherche des vols via le client GDS
    const gdsClient = getGdsClient()
    const result = await gdsClient.searchFlights(params)

    // Appliquer les marges
    const flightsWithMargins = await applyMargins(result.flights)

    return NextResponse.json(
      {
        ...result,
        flights: flightsWithMargins,
      },
      { status: 200 },
    )
  } catch (err) {
    return mapErrorToResponse(err)
  }
}

function mapErrorToResponse(err: unknown): NextResponse {
  if (err instanceof FlightApiError) {
    return NextResponse.json(
      { error: err.kind, message: err.message },
      { status: err.kind === "auth" ? 401 : 502 },
    )
  }
  return NextResponse.json(
    {
      error: "internal",
      message: err instanceof Error ? err.message : "unknown",
    },
    { status: 500 },
  )
}
