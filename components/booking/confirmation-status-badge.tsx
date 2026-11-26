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
import { Clock } from "lucide-react"
import { StatusBadge } from "@/components/ui/status-badge"
import { confirmationStatusTone } from "@/lib/booking/confirmation-status-tone"
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

  const STATUS_LABELS: Record<string, { label: string; icon?: typeof Clock }> =
    {
      pending: { label: t("statusPendingValidation"), icon: Clock },
      on_request: { label: t("statusOnRequestSupplier"), icon: Clock },
      confirmed: { label: t("statusConfirmedByE2B") },
      cancelled: { label: tc("statusCancelled") },
      completed: { label: t("statusCompletedShort") },
      refunded: { label: tc("statusRefunded") },
      no_show: { label: tc("statusNoShow") },
    }

  useRealtimeBroadcast(
    `reservation-${publicRef}`,
    "status_change",
    React.useCallback(() => {
      router.refresh()
    }, [router]),
  )

  const meta = STATUS_LABELS[status] ?? { label: status }

  return (
    <StatusBadge
      tone={confirmationStatusTone(status)}
      icon={meta.icon}
      className="mt-3"
    >
      {t("statusPrefix", { status: meta.label })}
    </StatusBadge>
  )
}
