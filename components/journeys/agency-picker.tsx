"use client"

/**
 * JOURNEY-BUILDER-01 — sélecteur d'agence pour /admin/journeys. Le staff
 * choisit l'agence pour laquelle il assiste/compose — jamais un Journey
 * "sans agence", jamais un agencyId deviné côté serveur pour le staff.
 */

import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  agencies: { id: string; name: string }[]
  selectedAgencyId?: string
}

export function AgencyPicker({ agencies, selectedAgencyId }: Props) {
  const router = useRouter()
  return (
    <Select value={selectedAgencyId} onValueChange={(v) => router.push(`/admin/journeys?agencyId=${v}`)}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder="Choisir une agence..." />
      </SelectTrigger>
      <SelectContent>
        {agencies.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
