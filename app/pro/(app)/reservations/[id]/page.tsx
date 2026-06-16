import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import {
  ArrowLeft,
  BedDouble,
  Calendar,
  CheckCircle2,
  FileText,
  Mail,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { formatTND } from "@/lib/pro/format"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadReservationById } from "@/lib/pro/reservation-detail"

export const metadata = {
  title: "Détail réservation | Espace Pro Easy2Book",
}

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente de confirmation",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  on_request: "Sur demande",
  no_show: "No-show",
  refunded: "Remboursée",
  completed: "Terminée",
}

export default async function ProReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/pro/login?next=/pro/reservations/${id}`)

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const reservation = await loadReservationById(id, profile.agency.id)
  if (!reservation) notFound()

  const createdDate = new Date(reservation.createdAt).toLocaleDateString(
    "fr-FR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  )

  return (
    <ProPageShell
      icon={Calendar}
      title={`Réservation ${reservation.publicRef}`}
      description="Détail du dossier client et du débit associé."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/pro/reservations">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Link>
        </Button>
      }
    >
      <div className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-6 md:p-8">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-100 text-xs text-emerald-800"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {STATUS_LABEL[reservation.status] ?? reservation.status}
          </Badge>
        </div>

        <dl className="mt-6 grid gap-3 md:grid-cols-2">
          <Field
            icon={FileText}
            label="Référence dossier"
            value={reservation.publicRef}
            mono
          />
          <Field icon={Calendar} label="Date de création" value={createdDate} />

          {reservation.hotelName ? (
            <Field
              icon={BedDouble}
              label="Hôtel"
              value={
                reservation.checkIn && reservation.checkOut
                  ? `${reservation.hotelName} · ${reservation.checkIn} → ${reservation.checkOut}${
                      reservation.nights ? ` (${reservation.nights} nuits)` : ""
                    }`
                  : reservation.hotelName
              }
            />
          ) : null}

          {reservation.customerName && reservation.customerName !== "—" ? (
            <Field
              icon={User}
              label="Voyageur principal"
              value={reservation.customerName}
            />
          ) : null}

          {reservation.customerEmail ? (
            <Field
              icon={Mail}
              label="Email client"
              value={reservation.customerEmail}
            />
          ) : null}
        </dl>

        <div className="border-border/50 bg-muted/30 mt-6 rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm font-medium">
              Total TTC débité
            </p>
            <p className="text-foreground text-xl font-bold">
              {formatTND(reservation.totalTnd)}
            </p>
          </div>
        </div>
      </div>
    </ProPageShell>
  )
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof FileText
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="border-border/50 flex items-start gap-3 rounded-xl border p-3">
      <div className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
          {label}
        </dt>
        <dd
          className={`text-foreground truncate text-sm font-medium ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </dd>
      </div>
    </div>
  )
}
