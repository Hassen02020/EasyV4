import Link from "next/link"
import {
  CheckCircle2,
  FileText,
  Calendar,
  Wallet,
  Building2,
  CreditCard,
  Banknote,
  ArrowRight,
  Mail,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { getProHotelById } from "@/lib/pro/hotels-fixture"
import { formatTND } from "@/lib/pro/format"

type ConfirmationSearchParams = {
  hotelId?: string
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

export default async function ProBookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>
  searchParams: Promise<ConfirmationSearchParams>
}) {
  const { ref } = await params
  const search = await searchParams
  const hotel = search.hotelId ? getProHotelById(search.hotelId) : undefined
  const total = search.total ? Number.parseFloat(search.total) : 0
  const paymentInfo = search.payment
    ? PAYMENT_LABEL[search.payment] ?? null
    : null
  const PaymentIcon = paymentInfo?.icon ?? Wallet

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
          Votre dossier B2B a été créé avec succès. Vous le retrouverez dans
          votre espace.
        </p>

        <dl className="mt-6 grid gap-3 md:grid-cols-2">
          <Field
            icon={FileText}
            label="Référence dossier"
            value={ref}
            mono
          />
          <Field
            icon={Calendar}
            label="Date de création"
            value={new Date().toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          {hotel ? (
            <Field
              icon={Building2}
              label="Hôtel"
              value={`${hotel.name} (${hotel.zone})`}
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
            <Field
              icon={FileText}
              label="Coupon appliqué"
              value={search.coupon}
            />
          ) : null}
          {search.ref ? (
            <Field
              icon={FileText}
              label="Réf. interne"
              value={search.ref}
            />
          ) : null}
        </dl>

        <div className="border-border/50 mt-6 rounded-2xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm">Total TTC</p>
            <p className="text-primary text-2xl font-bold tabular-nums">
              {formatTND(total)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1 rounded-xl">
            <Link href="/pro/reservations">
              Voir mes réservations
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 rounded-xl">
            <Link href="/pro">
              Nouvelle recherche
            </Link>
          </Button>
        </div>

        <div className="border-border/40 mt-6 flex items-start gap-2 rounded-xl border p-3 text-xs">
          <Mail className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="text-muted-foreground leading-snug">
            Un récapitulatif détaillé sera envoyé à l&apos;adresse e-mail
            associée à votre agence dès l&apos;enregistrement effectif côté
            base de données (phase 7).
          </p>
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
      <dt className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
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
