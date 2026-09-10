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
import { Info, ShieldCheck, ShieldX } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { getCancellationPolicyForDisplay } from "@/lib/booking/policy-display-actions"
import type { PolicyProductType, ResolvedPolicy } from "@/lib/booking/policy-engine"

interface CancellationPolicyDisplayProps {
  productType: PolicyProductType
  productId: string
  accepted: boolean
  onAcceptedChange: (accepted: boolean) => void
  /** Informe le formulaire parent si une politique réelle a été trouvée — permet de
   * n'exiger la case à cocher que lorsqu'il y a effectivement quelque chose à accepter. */
  onPolicyResolved?: (policy: ResolvedPolicy | null) => void
}

export function CancellationPolicyDisplay({
  productType,
  productId,
  accepted,
  onAcceptedChange,
  onPolicyResolved,
}: CancellationPolicyDisplayProps) {
  // `result` reste `null` tant que la résolution pour CE `productId` n'est
  // pas revenue — évite un `setState` synchrone dans le corps de l'effet
  // (dérivé via la comparaison `result?.productId !== productId` plutôt
  // qu'un reset explicite).
  const [result, setResult] = useState<{ productId: string; policy: ResolvedPolicy | null } | null>(null)
  const policy = result?.productId === productId ? result.policy : undefined

  useEffect(() => {
    let cancelled = false
    onAcceptedChange(false)
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
  }, [productType, productId])

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
            <p className="text-sm font-medium">Politique d&apos;annulation non définie</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Aucune politique d&apos;annulation n&apos;a encore été publiée pour ce produit.
              Contactez le support pour toute demande d&apos;annulation ou de modification
              après réservation.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const rules: { label: string; value: string }[] = [
    { label: "Annulable", value: policy.cancellable ? "Oui" : "Non" },
    { label: "Modifiable", value: policy.modifiable ? "Oui" : "Non" },
  ]
  if (policy.deadlineHours != null) {
    rules.push({ label: "Échéance", value: `${policy.deadlineHours} h avant le départ/la session` })
  }
  if (policy.nonRefundable) {
    rules.push({ label: "Remboursement", value: "Non remboursable" })
  } else {
    rules.push({
      label: "Frais d'annulation",
      value: policy.cancellationFeePercent != null ? `${policy.cancellationFeePercent}%` : "Aucun frais configuré",
    })
    rules.push({
      label: "Modalité",
      value: policy.creditAllowed
        ? "Crédit Easy2Book (portefeuille client)"
        : policy.refundAllowed
          ? "Remboursement"
          : "Aucun remboursement ni crédit",
    })
  }
  if (policy.requiresValidatedDocument) {
    rules.push({ label: "Justificatif", value: "Document requis pour toute annulation" })
  }

  return (
    <Card className={policy.cancellable && !policy.nonRefundable ? "border-emerald-200" : "border-amber-200"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          {policy.cancellable && !policy.nonRefundable ? (
            <ShieldCheck className="size-5 text-emerald-600" />
          ) : (
            <ShieldX className="size-5 text-amber-600" />
          )}
          <p className="text-sm font-semibold">Politique d&apos;annulation</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {rules.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm sm:block">
              <dt className="text-muted-foreground text-xs">{r.label}</dt>
              <dd className="font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        {policy.postDeadlineDescription ? (
          <p className="text-muted-foreground border-t pt-2 text-xs">{policy.postDeadlineDescription}</p>
        ) : null}
        <div className="flex items-start gap-2 border-t pt-3">
          <Checkbox
            id={`policy-accept-${productType}-${productId}`}
            checked={accepted}
            onCheckedChange={(v) => onAcceptedChange(Boolean(v))}
          />
          <Label
            htmlFor={`policy-accept-${productType}-${productId}`}
            className="text-muted-foreground text-sm leading-snug"
          >
            J&apos;ai lu et j&apos;accepte cette politique d&apos;annulation.
          </Label>
        </div>
      </CardContent>
    </Card>
  )
}
