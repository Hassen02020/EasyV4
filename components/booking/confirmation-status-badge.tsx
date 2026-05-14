"use client"

/**
 * Badge de statut en temps réel sur la page de confirmation client.
 *
 * Souscrit aux changements de la table `reservations` via Supabase Realtime
 * et déclenche `router.refresh()` à chaque UPDATE — ce qui re-fetch le
 * Server Component parent et affiche le nouveau statut côté Front-Office,
 * sans rechargement complet de la page.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useRealtimeTable } from "@/lib/supabase/use-realtime-table"

const STATUS_VARIANTS: Record<
  string,
  { label: string; className: string; icon: typeof Clock }
> = {
  pending: {
    label: "En attente de validation",
    className: "bg-amber-500 text-white hover:bg-amber-500",
    icon: Clock,
  },
  on_request: {
    label: "Sur demande fournisseur",
    className: "bg-sky-500 text-white hover:bg-sky-500",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmée par TunisiaGo",
    className: "bg-emerald-600 text-white hover:bg-emerald-600",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Annulée",
    className: "bg-red-600 text-white hover:bg-red-600",
    icon: XCircle,
  },
  completed: {
    label: "Terminée",
    className: "bg-emerald-700 text-white hover:bg-emerald-700",
    icon: CheckCircle2,
  },
  refunded: {
    label: "Remboursée",
    className: "bg-purple-600 text-white hover:bg-purple-600",
    icon: XCircle,
  },
  no_show: {
    label: "No-show",
    className: "bg-slate-500 text-white hover:bg-slate-500",
    icon: XCircle,
  },
}

export function ConfirmationStatusBadge({
  publicRef,
  status,
}: {
  publicRef: string
  status: string
}) {
  const router = useRouter()

  useRealtimeTable("reservations", (event) => {
    const newRef = (event.newRow?.public_ref as string | undefined) ?? null
    const oldRef = (event.oldRow?.public_ref as string | undefined) ?? null
    if (newRef === publicRef || oldRef === publicRef) {
      router.refresh()
    }
  })

  const meta = STATUS_VARIANTS[status] ?? {
    label: status,
    className: "bg-slate-500 text-white hover:bg-slate-500",
    icon: Clock,
  }
  const Icon = meta.icon

  return (
    <Badge className={`mt-3 gap-1 ${meta.className}`}>
      <Icon className="size-3" />
      Statut : {meta.label}
    </Badge>
  )
}
