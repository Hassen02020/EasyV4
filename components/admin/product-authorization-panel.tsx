"use client"

/**
 * ProductAuthorizationPanel — autoriser/révoquer une agence pour un
 * produit (Phase 13.1, gap #2/#3 — "Agency → Authorized Products").
 */

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { X, Plus } from "lucide-react"
import {
  authorizeAgencyForProduct,
  revokeAgencyAuthorization,
} from "@/lib/admin/product-authorizations-actions"

interface AgencyOption {
  id: string
  name: string
  brandName: string | null
  agencyType: string
}

interface ExistingAuthorization {
  id: string
  agencyId: string
  agencyName: string
  channel: string
  isActive: boolean
}

interface ProductAuthorizationPanelProps {
  productType: "package" | "omra" | "activity"
  productId: string
  agencies: AgencyOption[]
  authorizations: ExistingAuthorization[]
}

export function ProductAuthorizationPanel({
  productType,
  productId,
  agencies,
  authorizations,
}: ProductAuthorizationPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedAgencyId, setSelectedAgencyId] = useState(agencies[0]?.id ?? "")
  const [channel, setChannel] = useState<"b2b" | "white_label">("b2b")
  const [rows, setRows] = useState(authorizations.filter((a) => a.isActive))
  const [error, setError] = useState<string | null>(null)

  function handleAuthorize() {
    if (!selectedAgencyId) return
    setError(null)
    startTransition(async () => {
      const result = await authorizeAgencyForProduct({
        agencyId: selectedAgencyId,
        productType,
        productId,
        channel,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const agency = agencies.find((a) => a.id === selectedAgencyId)
      setRows((prev) => [
        ...prev.filter((r) => r.agencyId !== selectedAgencyId),
        { id: result.data.id, agencyId: selectedAgencyId, agencyName: agency?.name ?? "?", channel, isActive: true },
      ])
    })
  }

  function handleRevoke(authorizationId: string) {
    startTransition(async () => {
      const result = await revokeAgencyAuthorization(authorizationId)
      if (result.ok) {
        setRows((prev) => prev.filter((r) => r.id !== authorizationId))
      }
    })
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {rows.length === 0 ? (
          <span className="text-xs text-muted-foreground">Aucune agence autorisée</span>
        ) : (
          rows.map((r) => (
            <Badge key={r.id} variant="outline" className="gap-1.5 pr-1">
              {r.agencyName} · {r.channel === "b2b" ? "B2B" : "White Label"}
              <button
                type="button"
                onClick={() => handleRevoke(r.id)}
                disabled={isPending}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                aria-label={`Révoquer ${r.agencyName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Choisir une agence" />
          </SelectTrigger>
          <SelectContent>
            {agencies.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.brandName ?? a.name} ({a.agencyType})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={(v) => setChannel(v as "b2b" | "white_label")}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="b2b">B2B</SelectItem>
            <SelectItem value="white_label">White Label</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleAuthorize} disabled={isPending || !selectedAgencyId}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Autoriser
        </Button>
      </div>
    </div>
  )
}
