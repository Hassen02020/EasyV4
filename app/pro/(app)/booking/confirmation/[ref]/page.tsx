import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CheckCircle2,
  FileText,
  Calendar,
  Wallet,
  Building2,
  CreditCard,
  Banknote,
  ArrowRight,
  BedDouble,
  User,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatTND } from "@/lib/pro/format"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadReservationByRef } from "@/lib/pro/reservation-detail"

type ConfirmationSearchParams = {
  payment?: string
  total?: string
  coupon?: string
  ref?: string
}

const PAYMENT_LABEL: Record<string, { label: string; icon: typeof Wallet }> = {
  deposit: { label: "Compte de dépôt", icon: Wallet },
  transfer: { label: "Virement bancaire", icon: Building2 },
  card: { label: "Carte bancaire", icon: CreditCard },
  check: { label: "Chèque bancaire", icon: Banknote },
}

export const metadata = {
  title: "Réservation confirmée | Espace Pro Easy2Book",
}

export const dynamic = "force-dynamic"

export default async function ProBookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>
  searchParams: Promise<ConfirmationSearchParams>
}) {
  const { ref } = await params
  const search = await searchParams

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const reservation = await loadReservationByRef(ref, profile.agency.id)

  const total = reservation?.totalTnd ?? (search.total ? Number.parseFloat(search.total) : 0)
  const paymentInfo = search.payment ? (PAYMENT_LABEL[search.payment] ?? null) : null
  const PaymentIcon = paymentInfo?.icon ?? Wallet

  const createdDate = reservation
    ? new Date(reservation.createdAt).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="bg-card border-border/60 shadow-e2b-elevated rounded-2xl border p-6 md:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-foreground text-center text-2xl font-bold tracking-tight md:text-3xl">
          Réservation enregistrée
        </h1>
        <p className="text-muted-foreground mt-2 text-center text-sm">
          Votre dossier B2B a été créé avec succès et votre wallet a été débité.
        </p>

        {reservation ? (
          <div className="mt-3 flex justify-center">
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-100 text-emerald-800 text-xs"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {reservation.status === "pending" ? "En attente de confirmation" : reservation.status}
            </Badge>
          </div>
        ) : null}

        <dl className="mt-6 grid gap-3 md:grid-cols-2">
          <Field icon={FileText} label="Référence dossier" value={ref} mono />
          <Field icon={Calendar} label="Date de création" value={createdDate} />

          {reservation?.hotelName ? (
            <Field
              icon={BedDouble}
              label="Hôtel"
              value={
                reservation.checkIn && reservation.checkOut
                  ? `${reservation.hotelName} · ${reservation.checkIn} → ${reservation.checkOut}${reservation.nights ? ` (${reservation.nights} nuits)` : ""}`
                  : reservation.hotelName
              }
            />
          ) : null}

          {reservation?.customerName && reservation.customerName !== "—" ? (
            <Field
              icon={User}
              label="Voyageur principal"
              value={reservation.customerName}
            />
          ) : null}

          {paymentInfo ? (
            <Field
              icon={PaymentIcon}
              label="Mode de paiement"
              value={paymentInfo.label}
            />
          ) : null}

          {search.coupon ? (
            <Field icon={FileText} label="Coupon appliqué" value={search.coupon} />
          ) : null}

          {search.ref ? (
            <Field icon={FileText} label="Réf. interne" value={search.ref} />
          ) : null}
        </dl>

        <div className="border-border/50 bg-muted/30 mt-6 rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm font-medium">Total TTC débité</p>
            <p className="text-primary text-2xl font-bold tabular-nums">
              {formatTND(total)}
            </p>
          </div>
          {reservation && (
            <p className="text-muted-foreground mt-1 text-xs">
              Solde wallet mis à jour · Réf. BDD :{" "}
              <span className="font-mono">{reservation.id.slice(0, 8)}…</span>
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1 rounded-xl">
            <Link href="/pro/reservations">
              Voir mes réservations
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 rounded-xl">
            <Link href="/pro">Nouvelle recherche</Link>
          </Button>
        </div>
      </div>
    </div>
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
    <div className="border-border/50 rounded-xl border p-3">
      <dt className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd
        className={
          mono
            ? "text-foreground mt-1 font-mono text-sm font-semibold tabular-nums"
            : "text-foreground mt-1 text-sm font-medium"
        }
      >
        {value}
      </dd>
    </div>
  )
}
