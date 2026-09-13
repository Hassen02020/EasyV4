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
  Ticket,
  Wallet,
  Star,
  MapPin,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations, useLocale } from "next-intl"
import { getIntlLocale } from "@/lib/i18n-date"
import type { BookingStatus, BookingSummary } from "@/lib/booking/summary-types"
import { voucherHrefForModule } from "@/lib/pro/voucher-eligibility"

/** Modules pour lesquels un avis a du sens — même liste que REVIEW_MODULES
 * (lib/reviews/reviews-core.ts), dupliquée ici pour ne jamais importer de
 * code serveur (schema/DB) dans ce composant client. */
const REVIEWABLE_MODULES = ["hotel", "omra", "package", "activity"]

const MODULE_ICONS: Record<string, React.ElementType> = {
  flight: Plane,
  hotel: Building2,
  hotel_world: Globe,
  hotel_monde: Globe,
  omra: Moon,
  package: Briefcase,
  activity: Ticket,
  transfer: Bus,
  car: Car,
}

/** Modules gérés par le Policy Engine (annulation via `cancelMyPolicyReservation`) — distinct de l'hôtel (`cancelMyHotelReservation`, politique myGo). */
const POLICY_ENGINE_MODULES = ["omra", "package", "activity"]

function StatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("Common")
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
      label: t("statusCompleted"),
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
  const t = useTranslations("Common")
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
   * PHASE "POLICY MANAGER" (volet A, hôtel) + "POLICY ENGINE" (volet B,
   * Omra/Package/Activity) — annulation réelle, disponible UNIQUEMENT
   * depuis le compte client authentifié (`app/compte/page.tsx`) :
   * `/bookings` (lookup anonyme ref+email) NE transmet PAS ce prop —
   * l'annulation y reste indisponible (l'identité n'y est prouvée que par
   * un texte email, pas une session vérifiée), même card, même composant,
   * juste une capacité en moins. Renvoie `{ok:false, error}` plutôt que de
   * lever — la card affiche l'erreur inline, jamais un throw non géré.
   * `messages` (Policy Engine uniquement) porte les libellés exacts requis
   * ("Annulation acceptée" / "Frais configurés: X" / "Crédit Easy2Book: X")
   * — affichés tels quels, jamais reformulés.
   */
  onCancel?: (bookingId: string) => Promise<{ ok: boolean; error?: string; messages?: string[] }>
  /**
   * Avis client — même frontière que `onCancel` : `/compte`
   * (authentifié) seul le transmet, `/bookings` (lookup anonyme) ne le
   * fait jamais (soumettre un avis exige une session Supabase vérifiée,
   * pas juste ref+email — voir app/actions/submit-review.ts).
   */
  onReview?: (bookingId: string, rating: number, comment: string) => Promise<{ ok: boolean; error?: string }>
}

export function BookingCard({ booking, onCancel, onReview }: BookingCardProps) {
  const t = useTranslations("Common")
  const locale = useLocale()
  const MODULE_LABELS: Record<string, string> = {
    flight: t("moduleLabelFlightFull"),
    hotel: t("moduleLabelHotelTunisie"),
    hotel_world: t("moduleLabelHotelWorld"),
    hotel_monde: t("moduleLabelHotelMonde"),
    omra: t("moduleLabelOmraty"),
    package: t("moduleLabelPackageFull"),
    activity: t("moduleLabelActivityFull"),
    transfer: t("moduleLabelTransferFull"),
    car: t("moduleLabelCarRental"),
  }
  const PAYMENT_METHOD_LABEL: Record<string, string> = {
    card: t("paymentMethodCard"),
    wallet: t("paymentMethodWallet"),
    transfer: t("paymentMethodTransfer"),
    cash: t("paymentMethodCash"),
    at_hotel: t("paymentMethodAtHotel"),
  }
  const PAYMENT_STATUS_LABEL: Record<string, string> = {
    pending: t("paymentStatusPending"),
    captured: t("paymentStatusCaptured"),
    failed: t("paymentStatusFailed"),
    refunded: t("paymentStatusRefunded"),
    authorized: t("paymentStatusAuthorized"),
    partial_refund: t("paymentStatusPartialRefund"),
  }
  const ModuleIcon = MODULE_ICONS[booking.module] ?? Briefcase
  const moduleLabel = MODULE_LABELS[booking.module] ?? booking.module
  const [confirming, setConfirming] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [successMessages, setSuccessMessages] = useState<string[] | null>(null)
  const [pending, startTransition] = useTransition()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.hasReview)
  const [reviewPending, startReviewTransition] = useTransition()

  const canReview =
    Boolean(onReview) &&
    REVIEWABLE_MODULES.includes(booking.module) &&
    (booking.status === "confirmed" || booking.status === "completed") &&
    !reviewSubmitted

  function handleSubmitReview() {
    if (!onReview) return
    setReviewError(null)
    startReviewTransition(async () => {
      const result = await onReview(booking.id, reviewRating, reviewComment)
      if (!result.ok) {
        setReviewError(result.error ?? t("reviewSubmitFailed"))
        return
      }
      setReviewSubmitted(true)
      setReviewOpen(false)
    })
  }

  // Hôtel (myGo, `cancelMyHotelReservation`) + Omra/Package/Activity
  // (Policy Engine, `cancelMyPolicyReservation`) — les deux mécanismes
  // réels d'annulation en ligne existants à ce jour.
  const isPolicyEngineModule = POLICY_ENGINE_MODULES.includes(booking.module)
  const canCancelOnline =
    Boolean(onCancel) &&
    (booking.module === "hotel" || isPolicyEngineModule) &&
    (booking.status === "pending" || booking.status === "confirmed" || booking.status === "on_request")

  function handleConfirmCancel() {
    if (!onCancel) return
    setCancelError(null)
    startTransition(async () => {
      const result = await onCancel(booking.id)
      if (!result.ok) {
        setCancelError(result.error ?? t("cancelFailed"))
        return
      }
      setConfirming(false)
      setSuccessMessages(result.messages ?? null)
    })
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—"
    return new Date(iso).toLocaleDateString(getIntlLocale(locale), {
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
        {/* Destination/produit, dates, voyageurs — ticket E2B-004 */}
        {booking.product ? (
          <div className="bg-muted/40 flex flex-col gap-2 rounded-xl p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
              <span>{booking.product.label}</span>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {booking.product.startDate === booking.product.endDate
                  ? formatDate(booking.product.startDate)
                  : `${formatDate(booking.product.startDate)} — ${formatDate(booking.product.endDate)}`}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0" />
                {booking.product.travelers}
              </span>
            </div>
          </div>
        ) : null}

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
                  <p className="text-muted-foreground text-xs">{t("paymentMethodLabel")}</p>
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
                  <p className="text-muted-foreground text-xs">{t("paymentDeadlineLabel")}</p>
                  <p className="text-foreground font-medium">
                    {t("beforeDate", { date: formatDate(booking.paymentExpiresAt) })}
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
              {parseFloat(booking.tndAmount).toLocaleString(getIntlLocale(locale))} DT
            </p>
            {booking.originalCurrency !== "TND" && (
              <p className="text-muted-foreground text-xs">
                ({parseFloat(booking.originalAmount).toLocaleString(getIntlLocale(locale))}{" "}
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

        {/* Politique d'annulation (Omra/Package/Activity — Policy Engine) —
            snapshot FIGÉ au moment de CETTE réservation, jamais recalculé. */}
        {isPolicyEngineModule && booking.cancellationPolicy !== undefined && (
          <>
            <Separator />
            {booking.cancellationPolicy === null ? (
              <p className="text-muted-foreground text-xs">
                {t("policyUndefinedAtBooking")}
              </p>
            ) : (
              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  {t("cancellableColon")}{" "}
                  <span className="text-foreground font-medium">
                    {booking.cancellationPolicy.cancellable && !booking.cancellationPolicy.nonRefundable
                      ? t("yes")
                      : t("no")}
                  </span>
                </span>
                {booking.cancellationPolicy.cancellationFeePercent != null && (
                  <span>
                    {t("feesColon")}{" "}
                    <span className="text-foreground font-medium">
                      {booking.cancellationPolicy.cancellationFeePercent}%
                    </span>
                  </span>
                )}
                {booking.cancellationPolicy.deadlineHours != null && (
                  <span>
                    {t("deadlineColon")}{" "}
                    <span className="text-foreground font-medium">
                      {booking.cancellationPolicy.deadlineHours} {t("hoursUnit")}
                    </span>
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Actions — PHASE 30.1 : les liens voucher/facture exigent le
            `?token=` requis par les routes guest (même frontière d'accès
            que /booking/confirmation/[ref], Phase 21.1 : publicRef seul
            n'est jamais suffisant) — "Facture PDF" utilise `hasInvoice`
            (réellement émise), même logique que la page de confirmation. */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(() => {
            const voucherHref =
              booking.status === "confirmed" || booking.status === "completed"
                ? voucherHrefForModule(booking.module, booking.publicRef, booking.guestAccessToken)
                : null
            return voucherHref ? (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={voucherHref} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  {t("voucherPdf")}
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" disabled>
                <Download className="h-4 w-4" />
                {t("voucherPdf")}
              </Button>
            )
          })()}
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
          {canReview ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setReviewOpen(true)}
            >
              <Star className="h-4 w-4" />
              {t("leaveReviewButton")}
            </Button>
          ) : reviewSubmitted && REVIEWABLE_MODULES.includes(booking.module) ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("reviewSentLabel")}
            </span>
          ) : null}
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

        {canReview && reviewOpen && (
          <div className="border-border bg-muted/20 space-y-3 rounded-lg border p-3 text-sm">
            <p className="text-foreground font-medium">{t("reviewFormTitle")}</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setReviewRating(n)}
                  aria-label={t("starAriaLabel", { n })}
                  className="p-0.5"
                >
                  <Star
                    className={
                      n <= reviewRating
                        ? "h-6 w-6 fill-amber-400 text-amber-400"
                        : "text-muted-foreground h-6 w-6"
                    }
                  />
                </button>
              ))}
            </div>
            <Textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder={t("reviewCommentPlaceholder")}
              className="min-h-20 text-sm"
              maxLength={2000}
            />
            {reviewError && <p className="text-destructive text-xs font-medium">{reviewError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSubmitReview}
                disabled={reviewPending}
              >
                {reviewPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                {t("sendReviewButton")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReviewOpen(false)} disabled={reviewPending}>
                {t("annuler")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("reviewModerationNotice")}
            </p>
          </div>
        )}

        {successMessages && successMessages.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              {successMessages.map((m) => (
                <p key={m} className="font-medium">{m}</p>
              ))}
            </div>
          </div>
        )}

        {canCancelOnline && confirming && (
          <div className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-3 text-sm">
            <p className="text-foreground flex items-start gap-2">
              <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
              {isPolicyEngineModule
                ? t("cancelConfirmPolicyText")
                : t("cancelConfirmHotelText")}
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
                {t("confirmCancelButton")}
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
                {t("keepReservationButton")}
              </Button>
            </div>
          </div>
        )}

        {booking.status === "pending" && (
          <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-xs">
            {booking.onlinePaymentAvailable ? (
              <p>{t("onlinePaymentAvailableNotice")}</p>
            ) : (
              <p>
                {t("onlinePaymentUnavailableNotice")}
                {booking.payment?.method === "cash"
                  ? t("payCashNotice")
                  : booking.payment?.method === "transfer"
                    ? t("payTransferNotice")
                    : ""}
              </p>
            )}
          </div>
        )}

        {booking.status === "expired" && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-xs font-medium">
            {t("paymentExpiredNotice")}
          </div>
        )}

        {!canCancelOnline && (booking.status === "pending" || booking.status === "on_request") && (
          <p className="text-muted-foreground text-xs">
            {t.rich("cancelSoonAvailableNotice", {
              phoneLink: (chunks) => (
                <a href="tel:+21698140514" className="text-primary hover:underline">
                  {chunks}
                </a>
              ),
            })}
          </p>
        )}
      </div>
    </div>
  )
}
