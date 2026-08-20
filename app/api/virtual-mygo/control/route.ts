/**
 * Route de contrôle du Virtual MyGo Supplier — réservée aux tests.
 *
 * Permet au harness (Playwright, scripts de charge, tests d'intégration)
 * de changer de scénario de panne ou de réinitialiser l'état (inventaire,
 * ledger de réservations) ENTRE deux cas de test, sans redémarrer le
 * process Next.js. Jamais exposée au frontend applicatif — uniquement
 * appelée par du code de test, et refuse tout si MYGO_MODE !== "virtual".
 */

import { NextRequest, NextResponse } from "next/server"
import { getMyGoConfig } from "@/lib/mygo/config"
import {
  getScenario,
  setScenario,
  resetScenario,
} from "@/lib/mygo/virtual-supplier/scenarios"
import { resetInventory } from "@/lib/mygo/virtual-supplier/inventory-store"
import { resetLedger, listBookingRecords } from "@/lib/mygo/virtual-supplier/booking-ledger"
import { resetCatalog, getCatalog } from "@/lib/mygo/virtual-supplier/catalog"

function guard() {
  if (getMyGoConfig().mode !== "virtual") {
    return NextResponse.json(
      { error: "virtual_mygo_disabled", message: "MYGO_MODE is not 'virtual'" },
      { status: 403 },
    )
  }
  return null
}

export async function GET() {
  const denied = guard()
  if (denied) return denied
  return NextResponse.json({
    scenario: getScenario(),
    hotelCount: getCatalog().length,
    bookingCount: listBookingRecords().length,
  })
}

export async function POST(req: NextRequest) {
  const denied = guard()
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    scenario?: string
  }

  switch (body.action) {
    case "setScenario": {
      const applied = setScenario(body.scenario ?? "NORMAL")
      return NextResponse.json({ ok: true, scenario: applied })
    }
    case "resetScenario": {
      resetScenario()
      return NextResponse.json({ ok: true, scenario: getScenario() })
    }
    case "resetInventory": {
      resetInventory()
      return NextResponse.json({ ok: true })
    }
    case "resetLedger": {
      resetLedger()
      return NextResponse.json({ ok: true })
    }
    case "resetAll": {
      resetScenario()
      resetInventory()
      resetLedger()
      resetCatalog()
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 })
  }
}
