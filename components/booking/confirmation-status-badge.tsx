"use client"

/**
 * Badge de statut en temps réel sur la page de confirmation client.
 *
 * Souscrit au canal Supabase Broadcast `reservation-<publicRef>` (cf.
 * `lib/supabase/use-realtime-broadcast.ts`) et déclenche `router.refresh()`
 * à chaque événement `status_change` — ce qui re-fetch le Server Component
 * parent et affiche le nouveau statut côté Front-Office, sans rechargement.
 *
 * Pourquoi Broadcast et pas `postgres_changes` :
 * la table `reservations` est protégée par RLS (tenant_isolation par agence)
 * et le visiteur anonyme n'a aucun droit `SELECT`, donc Supabase Realtime
 * refuserait de lui pousser les UPDATE. Broadcast est un bus de messages
 * indépendant de RLS, parfait pour le Front public.
 */

import * as React from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useRealtimeBroadcast } from "@/lib/supabase/use-realtime-broadcast"

export function ConfirmationStatusBadge({
  publicRef,
  status,
}: {
  publicRef: string
  status: string
}) {
  const router = useRouter()
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")

  const STATUS_VARIANTS: Record<
    string,
    { label: string; className: string; icon: typeof Clock }
  > = {
    pending: {
      label: t("statusPendingValidation"),
      className: "bg-amber-500 text-white hover:bg-amber-500",
      icon: Clock,
    },
    on_request: {
      label: t("statusOnRequestSupplier"),
      className: "bg-sky-500 text-white hover:bg-sky-500",
      icon: Clock,
    },
    confirmed: {
      label: t("statusConfirmedByE2B"),
      className: "bg-emerald-600 text-white hover:bg-emerald-600",
      icon: CheckCircle2,
    },
    cancelled: {
      label: tc("statusCancelled"),
      className: "bg-red-600 text-white hover:bg-red-600",
      icon: XCircle,
    },
    completed: {
      label: t("statusCompletedShort"),
      className: "bg-emerald-700 text-white hover:bg-emerald-700",
      icon: CheckCircle2,
    },
    refunded: {
      label: tc("statusRefunded"),
      className: "bg-purple-600 text-white hover:bg-purple-600",
      icon: XCircle,
    },
    no_show: {
      label: tc("statusNoShow"),
      className: "bg-slate-500 text-white hover:bg-slate-500",
      icon: XCircle,
    },
  }

  useRealtimeBroadcast(
    `reservation-${publicRef}`,
    "status_change",
    React.useCallback(() => {
      router.refresh()
    }, [router]),
  )

  const meta = STATUS_VARIANTS[status] ?? {
    label: status,
    className: "bg-slate-500 text-white hover:bg-slate-500",
    icon: Clock,
  }
  const Icon = meta.icon

  return (
    <Badge className={`mt-3 gap-1 ${meta.className}`}>
      <Icon className="size-3" />
      {t("statusPrefix", { status: meta.label })}
    </Badge>
  )
}
