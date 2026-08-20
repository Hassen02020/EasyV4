/**
 * Virtual MyGo Supplier — endpoint HTTP.
 *
 * Reçoit exactement ce que `MyGoClient` envoie au vrai myGo (POST JSON,
 * Credential + body par méthode) et répond dans le MÊME format que le vrai
 * myGo — validé par les mêmes schémas Zod côté client. Monté uniquement en
 * `MYGO_MODE=virtual` (voir lib/mygo/config.ts, qui force le baseUrl du
 * client vers cette route dans ce mode).
 *
 * Garde-fou : répond 403 si appelée alors que MYGO_MODE n'est pas "virtual"
 * — défense en profondeur en plus du forçage de baseUrl côté config.
 */

import { NextRequest, NextResponse } from "next/server"
import { getMyGoConfig } from "@/lib/mygo/config"
import {
  handleListCity,
  handleListBoarding,
  handleListCurrency,
  handleListTag,
  handleListHotel,
  handleHotelDetail,
  handleHotelSearch,
  handleBookingCreation,
  handleBookingCancellation,
  handleBookingList,
} from "@/lib/mygo/virtual-supplier/engine"
import { getScenario } from "@/lib/mygo/virtual-supplier/scenarios"

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ method: string }> },
) {
  if (getMyGoConfig().mode !== "virtual") {
    return NextResponse.json(
      { error: "virtual_mygo_disabled", message: "MYGO_MODE is not 'virtual'" },
      { status: 403 },
    )
  }

  const { method } = await params
  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ErrorMessage: { Code: 400, Description: "Invalid JSON body" } },
      { status: 200 },
    )
  }

  // NETWORK_ERROR est générique : simule une panne fournisseur 5xx quelle
  // que soit la méthode appelée — MyGoClient.httpJson classe déjà tout
  // status >= 500 en MyGoNetworkError, comportement réel, pas simulé.
  if (getScenario() === "NETWORK_ERROR") {
    return NextResponse.json(
      { error: "simulated_network_error" },
      { status: 502 },
    )
  }

  switch (method) {
    case "ListCity":
      return NextResponse.json(handleListCity())
    case "ListBoarding":
      return NextResponse.json(handleListBoarding())
    case "ListCurrency":
      return NextResponse.json(handleListCurrency())
    case "ListTag":
      return NextResponse.json(handleListTag())
    case "ListHotel":
      return NextResponse.json(handleListHotel(body))
    case "HotelDetail":
      return NextResponse.json(handleHotelDetail(body))
    case "HotelSearch":
      return NextResponse.json(handleHotelSearch(body))
    case "BookingCreation": {
      const result = await handleBookingCreation(body)
      if (result.delayMs) await sleep(result.delayMs)
      return NextResponse.json(result.json, { status: result.status })
    }
    case "BookingCancellation": {
      const result = await handleBookingCancellation(body)
      return NextResponse.json(result.json, { status: result.status })
    }
    case "BookingList":
      return NextResponse.json(handleBookingList(body))
    default:
      return NextResponse.json(
        { ErrorMessage: { Code: 404, Description: `Unknown method ${method}` } },
        { status: 200 },
      )
  }
}
