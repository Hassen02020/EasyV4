/**
 * CancellationPolicyDisplay — affichage + acceptation de la politique
 * d'annulation avant validation d'une réservation Omra/Package/Activity.
 *
 * Partagé par les 3 formulaires guest checkout (`omra-guest-booking-form`,
 * `package-guest-booking-form`, `activity-guest-booking-form`) — une seule
 * implémentation, pas de logique dupliquée par module.
 *
 * Résout la politique via `getCancellationPolicyForDisplay()` (lecture
 * publique, voir lib/booking/policy-display-actions.ts) — jamais un calcul
 * ou un pourcentage inventé côté client. Trois états honnêtes :
 *   - chargement (skeleton),
 *   - AUCUNE politique publiée → "Politique non définie", informationnel
 *     uniquement, la case à cocher n'est proposée que si une politique
 *     existe réellement (rien à accepter sinon) — le formulaire appelant
 *     reste donc soumettable sans blocage, car bloquer la réservation sur
 *     une politique absente n'est PAS une règle confirmée par l'audit
 *     business (voir lib/booking/policy-engine.ts, doc de tête).
 *   - politique réelle → détail complet (annulable/modifiable/échéance/
 *     frais/remboursement-crédit) + case à cocher obligatoire pour ce cas.
 */

"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Info, ShieldCheck, ShieldX } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { getCancellationPolicyForDisplay } from "@/lib/booking/policy-display-actions"
import { getIntlLocale } from "@/lib/i18n-date"
import type {
  PolicyProductType,
  ResolvedPolicy,
} from "@/lib/booking/policy-engine"

/** Données d'annulation lues depuis `draft.metadata` pour un hôtel — bypass
 * la récupération DB, affichage purement informatif (sans case à cocher). */
interface HotelCancellationOverride {
  hasFreeCancellation: boolean
  freeCancellationDate?: string
}

interface CancellationPolicyDisplayProps {
  productType?: PolicyProductType
  productId?: string
  accepted?: boolean
  onAcceptedChange?: (accepted: boolean) => void
  /** Informe le formulaire parent si une politique réelle a été trouvée — permet de
   * n'exiger la case à cocher que lorsqu'il y a effectivement quelque chose à accepter. */
  onPolicyResolved?: (policy: ResolvedPolicy | null) => void
  /** Mode hôtel : données d'annulation depuis `draft.metadata`, bypass DB, sans case à cocher. */
  hotelCancellation?: HotelCancellationOverride
}

export function CancellationPolicyDisplay({
  productType,
  productId,
  accepted,
  onAcceptedChange,
  onPolicyResolved,
  hotelCancellation,
}: CancellationPolicyDisplayProps) {
  const t = useTranslations("Booking")
  const locale = useLocale()
  // `result` reste `null` tant que la résolution pour CE `productId` n'est
  // pas revenue — évite un `setState` synchrone dans le corps de l'effet
  // (dérivé via la comparaison `result?.productId !== productId` plutôt
  // qu'un reset explicite).
  const [result, setResult] = useState<{
    productId: string
    policy: ResolvedPolicy | null
  } | null>(null)
  const policy = result?.productId === productId ? result?.policy : undefined

  useEffect(() => {
    if (hotelCancellation !== undefined) return
    if (!productType || !productId) return
    let cancelled = false
    onAcceptedChange?.(false)
    getCancellationPolicyForDisplay(productType, productId)
      .then((p) => {
        if (!cancelled) {
          setResult({ productId, policy: p })
          onPolicyResolved?.(p)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ productId, policy: null })
          onPolicyResolved?.(null)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, productId, hotelCancellation])

  // Mode hôtel — bypass DB, affichage informatif (pas de case à cocher)
  if (hotelCancellation !== undefined) {
    const formattedDate = hotelCancellation.freeCancellationDate
      ? (() => {
          try {
            return new Date(
              hotelCancellation.freeCancellationDate!,
            ).toLocaleDateString(getIntlLocale(locale), {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          } catch {
            return hotelCancellation.freeCancellationDate
          }
        })()
      : null

    return (
      <Card
        className={
          hotelCancellation.hasFreeCancellation
            ? "border-emerald-200"
            : "border-amber-200"
        }
      >
        <CardContent className="flex items-center gap-2 p-4">
          {hotelCancellation.hasFreeCancellation ? (
            <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
          ) : (
            <ShieldX className="size-5 shrink-0 text-amber-600" />
          )}
          <p className="text-sm font-medium">
            {hotelCancellation.hasFreeCancellation
              ? formattedDate
                ? t("freeCancellationUntilLabel", { date: formattedDate })
                : t("freeCancellationAvailable")
              : t("nonRefundable")}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (policy === undefined) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (policy === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("policyUndefinedTitle")}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("policyUndefinedDesc")}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const rules: { label: string; value: string }[] = [
    {
      label: t("cancellableLabel"),
      value: policy.cancellable ? t("yes") : t("no"),
    },
    {
      label: t("modifiableLabel"),
      value: policy.modifiable ? t("yes") : t("no"),
    },
  ]
  if (policy.deadlineHours != null) {
    rules.push({
      label: t("deadlineLabel"),
      value: t("deadlineValue", { hours: policy.deadlineHours }),
    })
  }
  if (policy.nonRefundable) {
    rules.push({ label: t("refundLabel"), value: t("nonRefundable") })
  } else {
    rules.push({
      label: t("cancellationFeeLabel"),
      value:
        policy.cancellationFeePercent != null
          ? `${policy.cancellationFeePercent}%`
          : t("noFeeConfigured"),
    })
    rules.push({
      label: t("modalityLabel"),
      value: policy.creditAllowed
        ? t("creditWallet")
        : policy.refundAllowed
          ? t("modalityRefundValue")
          : t("noRefundNoCredit"),
    })
  }
  if (policy.requiresValidatedDocument) {
    rules.push({ label: t("proofLabel"), value: t("documentRequired") })
  }

  return (
    <Card
      className={
        policy.cancellable && !policy.nonRefundable
          ? "border-emerald-200"
          : "border-amber-200"
      }
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          {policy.cancellable && !policy.nonRefundable ? (
            <ShieldCheck className="size-5 text-emerald-600" />
          ) : (
            <ShieldX className="size-5 text-amber-600" />
          )}
          <p className="text-sm font-semibold">{t("policyTitle")}</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {rules.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between text-sm sm:block"
            >
              <dt className="text-muted-foreground text-xs">{r.label}</dt>
              <dd className="font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        {policy.postDeadlineDescription ? (
          <p className="text-muted-foreground border-t pt-2 text-xs">
            {policy.postDeadlineDescription}
          </p>
        ) : null}
        <div className="flex items-start gap-2 border-t pt-3">
          <Checkbox
            id={`policy-accept-${productType}-${productId}`}
            checked={accepted}
            onCheckedChange={(v) => onAcceptedChange?.(Boolean(v))}
          />
          <Label
            htmlFor={`policy-accept-${productType}-${productId}`}
            className="text-muted-foreground text-sm leading-snug"
          >
            {t("acceptPolicyLabel")}
          </Label>
        </div>
      </CardContent>
    </Card>
  )
}
