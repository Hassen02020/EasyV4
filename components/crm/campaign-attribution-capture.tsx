"use client"
/**
 * CRM-LEAD-FLOW-01 — mémorise la campagne d'arrivée (premier contact de la
 * session) sur n'importe quelle page publique, pour qu'un formulaire rempli
 * plus loin dans la navigation garde son attribution. Ne rend rien.
 */
import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import {
  extractCampaignRef,
  rememberCampaignRef,
  safeSessionStorage,
} from "@/lib/crm/campaign-attribution-client"

function Capture() {
  const searchParams = useSearchParams()
  useEffect(() => {
    rememberCampaignRef(safeSessionStorage(), extractCampaignRef(searchParams))
  }, [searchParams])
  return null
}

export function CampaignAttributionCapture() {
  return (
    <Suspense fallback={null}>
      <Capture />
    </Suspense>
  )
}
