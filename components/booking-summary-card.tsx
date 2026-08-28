"use client"

/**
 * Card de résumé de réservation — extraite de `app/bookings/page.tsx`
 * (lookup anonyme ref+email) pour être réutilisée telle quelle par
 * l'historique du compte client authentifié (`app/compte/page.tsx`) : UNE
 * SEULE implémentation de l'affichage statut/timeline/paiement/voucher,
 * jamais une seconde carte susceptible de diverger.
 */

import { useState, useTransition } from "react"
import {
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plane,
  Building2,
  Globe,
  Moon,
  Briefcase,
  Bus,
  Car,
  Download,
  CalendarDays,
  User,
  Phone,
  Mail,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useT } from "@/components/locale-context"
import type { BookingStatus, BookingSummary } from "@/lib/booking/summary-types"

const MODULE_ICONS: Record<string, React.ElementType> = {
  flight: Plane,
  hotel: Building2,
  hotel_world: Globe,
  omra: Moon,
  package: Briefcase,
  transfer: Bus,
  car: Car,
}

const MODULE_LABELS: Record<string, string> = {
  flight: "Vol",
  hotel: "Hôtel Tunisie",
  hotel_world: "Hôtel International",
  omra: "Omraty",
  package: "Voyage Organisé",
  transfer: "Transfert",
  car: "Location Voiture",
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "Carte bancaire",
  wallet: "Wallet",
  transfer: "Virement bancaire",
  cash: "Espèces",
  at_hotel: "Paiement à l'hôtel",
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "en attente de vérification",
  captured: "réglé",
  failed: "échoué",
  refunded: "remboursé",
  authorized: "autorisé",
  partial_refund: "partiellement remboursé",
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const t = useT()
  const STATUS_CONFIG: Record<
    BookingStatus,
    { label: string; color: string; icon: React.ElementType }
  > = {
    pending: {
      label: t("statusPending"),
      color: "bg-amber-100 text-amber-800 border-amber-200",
      icon: Clock,
    },
    on_request: {
      label: t("statusOnRequest"),
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: RefreshCw,
    },
    confirmed: {
      label: t("statusConfirmed"),
      color: "bg-emerald-100 text-emerald-800 border-emerald-200",
      icon: CheckCircle2,
    },
    cancelled: {
      label: t("statusCancelled"),
      color: "bg-red-100 text-red-800 border-red-200",
      icon: XCircle,
    },
    refunded: {
      label: t("statusRefunded"),
      color: "bg-gray-100 text-gray-800 border-gray-200",
      icon: RefreshCw,
    },
    no_show: {
      label: t("statusNoShow"),
      color: "bg-red-100 text-red-700 border-red-200",
      icon: XCircle,
    },
    expired: {
      label: t("statusExpired"),
      color: "bg-gray-100 text-gray-600 border-gray-200",
      icon: XCircle,
    },
    completed: {
      label: "Séjour terminé",
      color: "bg-emerald-100 text-emerald-800 border-emerald-200",
      icon: CheckCircle2,
    },
  }
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${cfg.color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  )
}

function Timeline({ status }: { status: BookingStatus }) {
  const t = useT()
  const STEP_MAP: Record<BookingStatus, number> = {
    pending: 1,
    on_request: 2,
    confirmed: 3,
    cancelled: 0,
    refunded: 0,
    no_show: 0,
    expired: 0,
    completed: 3,
  }
  const TIMELINE_STEPS = [
    { label: t("demandeRecue"), step: 1 },
    { label: t("enTraitement"), step: 2 },
    { label: t("statusConfirmed"), step: 3 },
  ]
  const currentStep = STEP_MAP[status] ?? 0
  const isCancelled = currentStep === 0

  if (isCancelled) return null

  return (
    <div className="flex items-center gap-0">
      {TIMELINE_STEPS.map((s, i) => {
        const done = currentStep >= s.step
        const active = currentStep === s.step
        return (
          <div key={s.step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                      ? "border-sidebar bg-sidebar/10 text-sidebar"
                      : "border-gray-200 bg-white text-gray-400"
                }`}
              >
                {done && !active ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  s.step
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${done ? "text-emerald-600" : "text-muted-foreground"}`}
              >
                {s.label}
              </span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div
                className={`mb-4 h-0.5 w-12 sm:w-20 ${currentStep > s.step ? "bg-emerald-400" : "bg-gray-200"}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

interface BookingCardProps {
  booking: BookingSummary
  /**
   * PHASE "POLICY MANAGER" (volet A) — annulation réelle, disponible
   * UNIQUEMENT depuis le compte client authentifié (`app/compte/page.tsx`,
   * `cancelMyHotelReservation`) : `/bookings` (lookup anonyme ref+email)
   * NE transmet PAS ce prop — l'annulation y reste indisponible (l'identité
   * n'y est prouvée que par un texte email, pas une session vérifiée), même
   * card, même composant, juste une capacité en moins. Renvoie `{ok:false,
   * error}` plutôt que de lever — la card affiche l'erreur inline, jamais
   * un throw non géré.
   */
  onCancel?: (bookingId: string) => Promise<{ ok: boolean; error?: string }>
}

export function BookingCard({ booking, onCancel }: BookingCardProps) {
  const t = useT()
  const ModuleIcon = MODULE_ICONS[booking.module] ?? Briefcase
  const moduleLabel = MODULE_LABELS[booking.module] ?? booking.module
  const [confirming, setConfirming] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Hôtel uniquement (voir lib/booking/customer-cancel-actions.ts — seul
  // module câblé pour l'instant, Omra/Package/Activity n'ont aucune
  // exécution d'annulation à ce jour, voir l'audit Policy Manager).
  const canCancelOnline =
    Boolean(onCancel) &&
    booking.module === "hotel" &&
    (booking.status === "pending" || booking.status === "confirmed" || booking.status === "on_request")

  function handleConfirmCancel() {
    if (!onCancel) return
    setCancelError(null)
    startTransition(async () => {
      const result = await onCancel(booking.id)
      if (!result.ok) {
        setCancelError(result.error ?? "L'annulation a échoué.")
        return
      }
      setConfirming(false)
    })
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—"
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b bg-sidebar/3 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar/10">
            <ModuleIcon className="h-5 w-5 text-sidebar" />
          </div>
          <div>
            <p className="text-xs font-medium text-sidebar">{moduleLabel}</p>
            <p className="text-foreground font-mono text-lg font-bold tracking-wider">
              {booking.publicRef}
            </p>
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="space-y-5 p-5">
        {/* Timeline */}
        <div className="flex justify-center">
          <Timeline status={booking.status} />
        </div>

        <Separator />

        {/* Customer info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-foreground font-medium">
              {booking.customer.firstName} {booking.customer.lastName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">
              {booking.customer.email}
            </span>
          </div>
          {booking.customer.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">
                {booking.customer.phone}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">
              {t("creeLe")} {formatDate(booking.createdAt)}
            </span>
          </div>
        </div>

        <Separator />

        {/* Paiement */}
        {(booking.payment || booking.paymentExpiresAt) && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {booking.payment && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Méthode de paiement</p>
                  <p className="text-foreground font-medium">
                    {PAYMENT_METHOD_LABEL[booking.payment.method] ?? booking.payment.method}
                    {" — "}
                    <span
                      className={
                        booking.payment.status === "captured"
                          ? "text-emerald-600"
                          : booking.payment.status === "refunded"
                            ? "text-muted-foreground"
                            : "text-amber-600"
                      }
                    >
                      {PAYMENT_STATUS_LABEL[booking.payment.status] ?? booking.payment.status}
                    </span>
                  </p>
                </div>
              )}
              {booking.status === "pending" && booking.paymentExpiresAt && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Délai de règlement</p>
                  <p className="text-foreground font-medium">
                    Avant le {formatDate(booking.paymentExpiresAt)}
                  </p>
                </div>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Price + dates */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-muted-foreground text-xs">{t("montant")}</p>
            <p className="text-foreground text-xl font-bold">
              {parseFloat(booking.tndAmount).toLocaleString("fr-FR")} DT
            </p>
            {booking.originalCurrency !== "TND" && (
              <p className="text-muted-foreground text-xs">
                ({parseFloat(booking.originalAmount).toLocaleString("fr-FR")}{" "}
                {booking.originalCurrency})
              </p>
            )}
          </div>
          {booking.confirmedAt && (
            <div className="text-right">
              <p className="text-muted-foreground text-xs">
                {t("confirmeeLe")}
              </p>
              <p className="text-foreground text-sm font-medium">
                {formatDate(booking.confirmedAt)}
              </p>
            </div>
          )}
          {booking.cancelledAt && (
            <div className="text-right">
              <p className="text-muted-foreground text-xs">{t("annuleeLe")}</p>
              <p className="text-destructive text-sm font-medium">
                {formatDate(booking.cancelledAt)}
              </p>
            </div>
          )}
        </div>

        {/* Actions — PHASE 30.1 : les liens voucher/facture exigent le
            `?token=` requis par les routes guest (même frontière d'accès
            que /booking/confirmation/[ref], Phase 21.1 : publicRef seul
            n'est jamais suffisant) — "Facture PDF" utilise `hasInvoice`
            (réellement émise), même logique que la page de confirmation. */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(booking.status === "confirmed" || booking.status === "completed") &&
          booking.module === "hotel" ? (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a
                href={`/api/booking/voucher/${booking.publicRef}?token=${booking.guestAccessToken}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-4 w-4" />
                {t("voucherPdf")}
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" disabled>
              <Download className="h-4 w-4" />
              {t("voucherPdf")}
            </Button>
          )}
          {booking.hasInvoice ? (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a
                href={`/api/booking/invoice/${booking.publicRef}?token=${booking.guestAccessToken}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-4 w-4" />
                {t("facturePdf")}
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" disabled>
              <Download className="h-4 w-4" />
              {t("facturePdf")}
            </Button>
          )}
          {canCancelOnline ? (
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() => setConfirming(true)}
              disabled={pending}
            >
              <XCircle className="h-4 w-4" />
              {t("annuler")}
            </Button>
          ) : (
            booking.status === "pending" && (
              <Button variant="destructive" size="sm" className="ml-auto gap-1.5" disabled>
                <XCircle className="h-4 w-4" />
                {t("annuler")}
              </Button>
            )
          )}
        </div>

        {canCancelOnline && confirming && (
          <div className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-3 text-sm">
            <p className="text-foreground flex items-start gap-2">
              <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
              Confirmer l&apos;annulation de cette réservation ? Les frais réels du fournisseur
              hôtelier seront appliqués ; le solde éventuel sera crédité sur votre wallet
              Easy2Book (jamais un remboursement carte automatique).
            </p>
            {cancelError && <p className="text-destructive text-xs font-medium">{cancelError}</p>}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={handleConfirmCancel}
                disabled={pending}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirmer l&apos;annulation
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false)
                  setCancelError(null)
                }}
                disabled={pending}
              >
                Garder ma réservation
              </Button>
            </div>
          </div>
        )}

        {booking.status === "pending" && (
          <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-xs">
            {booking.onlinePaymentAvailable ? (
              <p>Vous pouvez régler cette réservation en ligne.</p>
            ) : (
              <p>
                Le paiement en ligne n&apos;est pas encore disponible pour cette réservation.
                {booking.payment?.method === "cash"
                  ? " Réglez en espèces à notre agence avant la date limite ci-dessus."
                  : booking.payment?.method === "transfer"
                    ? " Réglez par virement bancaire (coordonnées envoyées par email) avant la date limite ci-dessus."
                    : ""}
              </p>
            )}
          </div>
        )}

        {booking.status === "expired" && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-xs font-medium">
            Le délai de règlement (24h) est dépassé — cette réservation ne peut plus être payée ni
            validée. Contactez-nous si vous souhaitez effectuer une nouvelle réservation.
          </div>
        )}

        {!canCancelOnline && (booking.status === "pending" || booking.status === "on_request") && (
          <p className="text-muted-foreground text-xs">
            * L&apos;annulation en ligne sera disponible prochainement. Contactez{" "}
            <a href="tel:+21698140514" className="text-primary hover:underline">
              +216 98 140 514
            </a>{" "}
            pour toute assistance immédiate.
          </p>
        )}
      </div>
    </div>
  )
}
