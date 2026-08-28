"use client"

/**
 * Policy Engine — CRUD client (voir app/admin/products/policies/page.tsx).
 * Publier = toujours une NOUVELLE version (jamais un écrasement) — voir
 * lib/admin/cancellation-policy-actions.ts::publishCancellationPolicy.
 */

import { useMemo, useState, useTransition } from "react"
import { ShieldCheck, ShieldOff, History, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  publishCancellationPolicy,
  deactivateCancellationPolicy,
  type CancellationPolicyRow,
} from "@/lib/admin/cancellation-policy-actions"
import type { PolicyProductType } from "@/lib/booking/policy-engine"

interface ProductRow {
  id: string
  name: string
  type: "package" | "omra" | "activity"
}

const TYPE_LABEL: Record<PolicyProductType, string> = {
  omra: "Omra",
  package: "Voyage Organisé",
  activity: "Attraction",
}

function groupKey(row: { productType: string; productId: string | null }) {
  return `${row.productType}::${row.productId ?? "default"}`
}

export function CancellationPolicyManager({
  products,
  initialPolicies,
}: {
  products: ProductRow[]
  initialPolicies: CancellationPolicyRow[]
}) {
  const [policies, setPolicies] = useState(initialPolicies)
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)

  const groups = useMemo(() => {
    const map = new Map<string, CancellationPolicyRow[]>()
    for (const p of policies) {
      const key = groupKey(p)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    for (const list of map.values()) list.sort((a, b) => b.version - a.version)
    return Array.from(map.entries()).map(([key, versions]) => ({
      key,
      current: versions.find((v) => v.isActive) ?? versions[0]!,
      versions,
    }))
  }, [policies])

  function productName(type: string, id: string | null) {
    if (!id) return "Politique par défaut de l'agence"
    return products.find((p) => p.id === id)?.name ?? id
  }

  function toggleHistory(key: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function refresh() {
    const { listCancellationPolicies } = await import("@/lib/admin/cancellation-policy-actions")
    const result = await listCancellationPolicies()
    if (result.ok) setPolicies(result.data)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          {formOpen ? "Fermer" : "Publier une politique"}
        </Button>
      </div>

      {formOpen && (
        <PublishPolicyForm
          products={products}
          onPublished={() => {
            setFormOpen(false)
            void refresh()
          }}
        />
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Aucune politique publiée pour l&apos;instant — les réservations Omra/Package/Activity
            afficheront honnêtement &quot;Politique non définie&quot; jusqu&apos;à publication.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(({ key, current, versions }) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {TYPE_LABEL[current.productType]} — {productName(current.productType, current.productId)}
                  </CardTitle>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Version {current.version}
                    {current.isActive ? " · active" : " · désactivée"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {current.isActive ? (
                    <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground gap-1">
                      <ShieldOff className="h-3 w-3" /> Inactive
                    </Badge>
                  )}
                  {current.isActive && (
                    <DeactivateButton policyId={current.id} onDone={() => void refresh()} />
                  )}
                  <Button variant="ghost" size="sm" onClick={() => toggleHistory(key)} className="gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    {versions.length} version{versions.length > 1 ? "s" : ""}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <PolicySummary policy={current} />
                {expandedHistory.has(key) && versions.length > 1 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {versions
                      .filter((v) => v.id !== current.id)
                      .map((v) => (
                        <div key={v.id} className="text-muted-foreground rounded-md border p-2 text-xs">
                          <p className="mb-1 font-medium">Version {v.version} (historique)</p>
                          <PolicySummary policy={v} compact />
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function PolicySummary({ policy, compact }: { policy: CancellationPolicyRow; compact?: boolean }) {
  return (
    <ul className={compact ? "space-y-0.5" : "grid grid-cols-1 gap-1.5 sm:grid-cols-2"}>
      <li>Annulable : {policy.cancellable ? "Oui" : "Non"}</li>
      <li>Modifiable : {policy.modifiable ? "Oui" : "Non"}</li>
      <li>Délai : {policy.deadlineHours != null ? `${policy.deadlineHours} h avant le service` : "Non défini"}</li>
      <li>Frais d&apos;annulation : {policy.cancellationFeePercent != null ? `${policy.cancellationFeePercent}%` : "Non défini"}</li>
      <li>Remboursement autorisé : {policy.refundAllowed ? "Oui" : "Non"}</li>
      <li>Crédit Easy2Book autorisé : {policy.creditAllowed ? "Oui" : "Non"}</li>
      <li>Non remboursable : {policy.nonRefundable ? "Oui" : "Non"}</li>
      <li>Document validé requis : {policy.requiresValidatedDocument ? "Oui" : "Non"}</li>
      {policy.postDeadlineDescription && (
        <li className="sm:col-span-2">Après échéance : {policy.postDeadlineDescription}</li>
      )}
    </ul>
  )
}

function DeactivateButton({ policyId, onDone }: { policyId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deactivateCancellationPolicy(policyId)
          onDone()
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Désactiver"}
    </Button>
  )
}

function PublishPolicyForm({
  products,
  onPublished,
}: {
  products: ProductRow[]
  onPublished: () => void
}) {
  const [productType, setProductType] = useState<PolicyProductType>("omra")
  const [targetProductId, setTargetProductId] = useState<string>("__default__")
  const [cancellable, setCancellable] = useState(true)
  const [modifiable, setModifiable] = useState(false)
  const [deadlineHours, setDeadlineHours] = useState("")
  const [feePercent, setFeePercent] = useState("")
  const [refundAllowed, setRefundAllowed] = useState(true)
  const [creditAllowed, setCreditAllowed] = useState(true)
  const [nonRefundable, setNonRefundable] = useState(false)
  const [requiresValidatedDocument, setRequiresValidatedDocument] = useState(false)
  const [postDeadlineDescription, setPostDeadlineDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const productsForType = products.filter((p) => p.type === productType)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await publishCancellationPolicy({
        productType,
        productId: targetProductId === "__default__" ? null : targetProductId,
        cancellable,
        modifiable,
        deadlineHours: deadlineHours.trim() === "" ? null : Number(deadlineHours),
        cancellationFeePercent: feePercent.trim() === "" ? null : Number(feePercent),
        refundAllowed,
        creditAllowed,
        nonRefundable,
        requiresValidatedDocument,
        postDeadlineDescription: postDeadlineDescription.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onPublished()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publier une nouvelle version</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type de produit</Label>
              <Select value={productType} onValueChange={(v) => { setProductType(v as PolicyProductType); setTargetProductId("__default__") }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="omra">Omra</SelectItem>
                  <SelectItem value="package">Voyage Organisé</SelectItem>
                  <SelectItem value="activity">Attraction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cible</Label>
              <Select value={targetProductId} onValueChange={setTargetProductId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Politique par défaut (tout le type)</SelectItem>
                  {productsForType.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={cancellable} onCheckedChange={(v) => setCancellable(Boolean(v))} />
              Annulable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={modifiable} onCheckedChange={(v) => setModifiable(Boolean(v))} />
              Modifiable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={refundAllowed} onCheckedChange={(v) => setRefundAllowed(Boolean(v))} />
              Remboursement autorisé
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={creditAllowed} onCheckedChange={(v) => setCreditAllowed(Boolean(v))} />
              Crédit Easy2Book autorisé
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={nonRefundable} onCheckedChange={(v) => setNonRefundable(Boolean(v))} />
              Non remboursable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={requiresValidatedDocument} onCheckedChange={(v) => setRequiresValidatedDocument(Boolean(v))} />
              Document validé requis
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Délai avant le service (heures) — laisser vide si non défini</Label>
              <Input type="number" min={0} value={deadlineHours} onChange={(e) => setDeadlineHours(e.target.value)} placeholder="Non défini" />
            </div>
            <div className="space-y-2">
              <Label>Frais d&apos;annulation (%) — laisser vide si non défini</Label>
              <Input type="number" min={0} max={100} value={feePercent} onChange={(e) => setFeePercent(e.target.value)} placeholder="Non défini" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conditions après échéance (texte libre, optionnel)</Label>
            <Textarea value={postDeadlineDescription} onChange={(e) => setPostDeadlineDescription(e.target.value)} rows={2} />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" disabled={pending} className="gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Publier cette version
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
