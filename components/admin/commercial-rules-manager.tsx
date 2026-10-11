"use client"

/**
 * COMMERCIAL-RULES-ADMIN-01 — Gestionnaire de règles commerciales.
 * Hôtels (hotel_commercial_rules) + Vols (flight_commercial_rules).
 * Accessible super_admin uniquement.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Plus,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Trash2,
  Hotel,
  Plane,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  createCommercialRule,
  toggleCommercialRule,
  deleteCommercialRule,
  type CommercialRuleRow,
  type CreateCommercialRuleInput,
} from "@/lib/admin/commercial-rules-actions"

const CHANNEL_LABELS: Record<string, string> = {
  B2C: "B2C (grand public)",
  B2B: "B2B (agences partenaires)",
  PARTNER: "PARTNER",
  WHITE_LABEL: "WHITE_LABEL (marque blanche)",
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d)
}

function fmtRate(r: string) {
  return `${(Number(r) * 100).toFixed(2)}%`
}

function isCurrentlyActive(rule: CommercialRuleRow): boolean {
  const now = new Date()
  if (!rule.isActive) return false
  if (rule.validFrom && rule.validFrom > now) return false
  if (rule.validTo && rule.validTo < now) return false
  return true
}

interface RuleCardProps {
  rule: CommercialRuleRow
  onToggle: (rule: CommercialRuleRow) => void
  onDelete: (rule: CommercialRuleRow) => void
  isPending: boolean
}

function RuleCard({ rule, onToggle, onDelete, isPending }: RuleCardProps) {
  const active = isCurrentlyActive(rule)
  return (
    <div
      className={`rounded-lg border p-4 ${
        active
          ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
          : "border-border bg-muted/20 opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{rule.id.slice(0, 8)}…</span>
            {active ? (
              <Badge className="border-emerald-300 bg-emerald-100 text-xs text-emerald-800">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <XCircle className="mr-1 h-3 w-3" />
                Inactive
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              Priorité {rule.priority}
            </Badge>
            {rule.channel ? (
              <Badge variant="outline" className="text-xs">
                {rule.channel}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-400">
                Tous canaux
              </Badge>
            )}
            {rule.agencyId ? (
              <Badge variant="outline" className="font-mono text-xs">
                Agence {rule.agencyId.slice(0, 8)}…
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-400">
                <Globe className="mr-1 h-3 w-3" />
                Globale
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-4">
            <span>
              <span className="text-muted-foreground">Frais fixe : </span>
              <strong className="font-mono">{rule.fixedFee} {rule.currency}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Markup : </span>
              <strong className="font-mono">{fmtRate(rule.markupRate)}</strong>
            </span>
            {rule.minMarkup && (
              <span>
                <span className="text-muted-foreground">Min : </span>
                <span className="font-mono">{rule.minMarkup}</span>
              </span>
            )}
            {rule.maxMarkup && (
              <span>
                <span className="text-muted-foreground">Max : </span>
                <span className="font-mono">{rule.maxMarkup}</span>
              </span>
            )}
          </div>

          {rule.productScope && Object.keys(rule.productScope).length > 0 && (
            <p className="font-mono text-xs text-slate-500">
              Scope : {JSON.stringify(rule.productScope)}
            </p>
          )}

          <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
            <span>Créée {fmt(rule.createdAt)}</span>
            {rule.validFrom && <span>Depuis {fmt(rule.validFrom)}</span>}
            {rule.validTo && <span>Jusqu&apos;au {fmt(rule.validTo)}</span>}
          </div>

          {rule.notes && (
            <p className="text-muted-foreground mt-0.5 text-xs italic">
              {rule.notes}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => onToggle(rule)}
            className={
              active
                ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                : "text-emerald-700 hover:bg-emerald-50"
            }
          >
            {active ? (
              <>
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Désactiver
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Activer
              </>
            )}
          </Button>
          {!active && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onDelete(rule)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Supprimer
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

interface CreateFormProps {
  type: "hotel" | "flight"
  onCreated: () => void
  onCancel: () => void
}

function CreateForm({ type, onCreated, onCancel }: CreateFormProps) {
  const [isPending, startTransition] = useTransition()
  const [channel, setChannel] = useState<string>("__all__")
  const [priority, setPriority] = useState("50")
  const [fixedFee, setFixedFee] = useState("0")
  const [markupRate, setMarkupRate] = useState("0")
  const [minMarkup, setMinMarkup] = useState("")
  const [maxMarkup, setMaxMarkup] = useState("")
  const [currency, setCurrency] = useState("TND")
  const [notes, setNotes] = useState("")
  const [validFrom, setValidFrom] = useState("")
  const [validTo, setValidTo] = useState("")
  const [agencyId, setAgencyId] = useState("")
  // productScope: simple key=value pairs for the relevant dimensions
  const [scopeDestination, setScopeDestination] = useState("")
  const [scopeProvider, setScopeProvider] = useState("")
  const [scopeStars, setScopeStars] = useState("")
  const [scopeBoardBasis, setScopeBoardBasis] = useState("")
  const [scopeCabin, setScopeCabin] = useState("")
  const [scopeOrigin, setScopeOrigin] = useState("")
  const [scopeAirline, setScopeAirline] = useState("")

  function buildProductScope(): Record<string, unknown> | null {
    const scope: Record<string, unknown> = {}
    if (type === "hotel") {
      if (scopeDestination.trim()) scope.destination = scopeDestination.trim()
      if (scopeProvider.trim()) scope.provider = scopeProvider.trim()
      if (scopeStars.trim()) scope.stars = Number(scopeStars)
      if (scopeBoardBasis.trim()) scope.board_basis = scopeBoardBasis.trim()
    } else {
      if (scopeCabin.trim()) scope.cabin = scopeCabin.trim()
      if (scopeProvider.trim()) scope.provider = scopeProvider.trim()
      if (scopeOrigin.trim()) scope.origin = scopeOrigin.trim()
      if (scopeDestination.trim()) scope.destination = scopeDestination.trim()
      if (scopeAirline.trim()) scope.airline = scopeAirline.trim()
    }
    return Object.keys(scope).length > 0 ? scope : null
  }

  function handleCreate() {
    const input: CreateCommercialRuleInput = {
      type,
      agencyId: agencyId.trim() || null,
      channel: channel === "__all__" ? null : (channel as CreateCommercialRuleInput["channel"]),
      priority: Number(priority),
      productScope: buildProductScope(),
      fixedFee: Number(fixedFee),
      markupRate: Number(markupRate) / 100,
      minMarkup: minMarkup !== "" ? Number(minMarkup) : null,
      maxMarkup: maxMarkup !== "" ? Number(maxMarkup) : null,
      currency: type === "hotel" ? "TND" : currency,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      notes: notes.trim() || null,
    }

    startTransition(async () => {
      const result = await createCommercialRule(input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Règle commerciale créée")
      onCreated()
    })
  }

  const hotelScopeFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Destination (optionnel)</Label>
        <Input value={scopeDestination} onChange={(e) => setScopeDestination(e.target.value)} placeholder="ex : TUN, MAR…" />
      </div>
      <div className="space-y-1.5">
        <Label>Fournisseur (optionnel)</Label>
        <Input value={scopeProvider} onChange={(e) => setScopeProvider(e.target.value)} placeholder="ex : hotels-monde" />
      </div>
      <div className="space-y-1.5">
        <Label>Étoiles (optionnel)</Label>
        <Input type="number" min="1" max="5" value={scopeStars} onChange={(e) => setScopeStars(e.target.value)} placeholder="1–5" />
      </div>
      <div className="space-y-1.5">
        <Label>Board basis (optionnel)</Label>
        <Input value={scopeBoardBasis} onChange={(e) => setScopeBoardBasis(e.target.value)} placeholder="ex : BB, HB, AI…" />
      </div>
    </div>
  )

  const flightScopeFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Cabin (optionnel)</Label>
        <Input value={scopeCabin} onChange={(e) => setScopeCabin(e.target.value)} placeholder="ex : economy, business" />
      </div>
      <div className="space-y-1.5">
        <Label>Fournisseur (optionnel)</Label>
        <Input value={scopeProvider} onChange={(e) => setScopeProvider(e.target.value)} placeholder="ex : duffel" />
      </div>
      <div className="space-y-1.5">
        <Label>Origine (optionnel)</Label>
        <Input value={scopeOrigin} onChange={(e) => setScopeOrigin(e.target.value)} placeholder="ex : TUN" />
      </div>
      <div className="space-y-1.5">
        <Label>Destination (optionnel)</Label>
        <Input value={scopeDestination} onChange={(e) => setScopeDestination(e.target.value)} placeholder="ex : CDG" />
      </div>
      <div className="space-y-1.5">
        <Label>Compagnie (optionnel)</Label>
        <Input value={scopeAirline} onChange={(e) => setScopeAirline(e.target.value)} placeholder="ex : TU" />
      </div>
    </div>
  )

  return (
    <div className="bg-muted/30 space-y-5 rounded-lg border p-5">
      <h2 className="font-semibold">
        Créer une règle commerciale — {type === "hotel" ? "Hôtels" : "Vols"}
      </h2>

      {/* Ciblage */}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Ciblage</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les canaux</SelectItem>
                {Object.entries(CHANNEL_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priorité</Label>
            <Input type="number" min="1" max="1000" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ID Agence (UUID, vide = globale)</Label>
            <Input value={agencyId} onChange={(e) => setAgencyId(e.target.value)} placeholder="xxxxxxxx-xxxx-…" className="font-mono text-xs" />
          </div>
        </div>
      </fieldset>

      {/* Tarification */}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Tarification</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Frais fixe (TND)</Label>
            <Input type="number" step="0.001" min="0" value={fixedFee} onChange={(e) => setFixedFee(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Markup (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={markupRate} onChange={(e) => setMarkupRate(e.target.value)} placeholder="ex : 8 pour 8%" />
          </div>
          <div className="space-y-1.5">
            <Label>Plancher markup (TND, optionnel)</Label>
            <Input type="number" step="0.01" min="0" value={minMarkup} onChange={(e) => setMinMarkup(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Plafond markup (TND, optionnel)</Label>
            <Input type="number" step="0.01" min="0" value={maxMarkup} onChange={(e) => setMaxMarkup(e.target.value)} />
          </div>
          {type === "flight" && (
            <div className="space-y-1.5">
              <Label>Devise</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TND">TND</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {type === "hotel" && (
            <div className="space-y-1.5">
              <Label>Devise</Label>
              <Input value="TND" disabled className="bg-muted text-muted-foreground" />
              <p className="text-muted-foreground text-xs">Hôtels : TND uniquement (CURRENCY-DIM-01)</p>
            </div>
          )}
        </div>
      </fieldset>

      {/* Product scope */}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">
          Périmètre produit (optionnel — vide = s&apos;applique à tout)
        </legend>
        {type === "hotel" ? hotelScopeFields : flightScopeFields}
      </fieldset>

      {/* Validité */}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Validité (optionnel)</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Valide à partir de</Label>
            <Input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valide jusqu&apos;au</Label>
            <Input type="datetime-local" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
        </div>
      </fieldset>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Note interne (optionnel)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexte, décision Direction, campagne…" rows={2} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>Annuler</Button>
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Créer la règle"}
        </Button>
      </div>
    </div>
  )
}

interface RuleListProps {
  rules: CommercialRuleRow[]
  type: "hotel" | "flight"
  onMutated: () => void
}

function RuleList({ rules, type, onMutated }: RuleListProps) {
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const filtered = rules.filter((r) => r.type === type)
  const activeCount = filtered.filter(isCurrentlyActive).length

  function handleToggle(rule: CommercialRuleRow) {
    startTransition(async () => {
      const result = await toggleCommercialRule(rule.type, rule.id, !rule.isActive)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(rule.isActive ? "Règle désactivée" : "Règle activée")
      onMutated()
    })
  }

  function handleDelete(rule: CommercialRuleRow) {
    if (!confirm(`Supprimer cette règle ${rule.type} (${rule.id.slice(0, 8)}…) ?`)) return
    startTransition(async () => {
      const result = await deleteCommercialRule(rule.type, rule.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Règle supprimée")
      onMutated()
    })
  }

  return (
    <div className="space-y-4">
      {/* En-tête + bouton */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {filtered.length} règle{filtered.length !== 1 ? "s" : ""} —{" "}
          <span className="font-medium text-emerald-600">
            {activeCount} active{activeCount !== 1 ? "s" : ""}
          </span>
        </span>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? (
            <><ChevronUp className="mr-1 h-4 w-4" />Annuler</>
          ) : (
            <><Plus className="mr-1 h-4 w-4" />Nouvelle règle</>
          )}
        </Button>
      </div>

      {showForm && (
        <CreateForm
          type={type}
          onCreated={() => {
            setShowForm(false)
            onMutated()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {filtered.length === 0 && !showForm ? (
        <div className="bg-muted/30 rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground text-sm">
            Aucune règle commerciale — le moteur tombe en fallback{" "}
            <code className="bg-muted rounded px-1 text-xs">pricing_margins</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onDelete={handleDelete}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface CommercialRulesManagerProps {
  initial: CommercialRuleRow[]
}

export function CommercialRulesManager({ initial }: CommercialRulesManagerProps) {
  const [rules, setRules] = useState<CommercialRuleRow[]>(initial)

  function handleMutated() {
    // Recharge la page pour refléter l'état DB (même pattern que FxPolicyManager).
    window.location.reload()
  }

  const hotelCount = rules.filter((r) => r.type === "hotel").length
  const flightCount = rules.filter((r) => r.type === "flight").length

  return (
    <Tabs defaultValue="hotel" className="space-y-4">
      <TabsList>
        <TabsTrigger value="hotel" className="gap-2">
          <Hotel className="h-4 w-4" />
          Hôtels
          {hotelCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">{hotelCount}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="flight" className="gap-2">
          <Plane className="h-4 w-4" />
          Vols
          {flightCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">{flightCount}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="hotel">
        <RuleList rules={rules} type="hotel" onMutated={handleMutated} />
      </TabsContent>
      <TabsContent value="flight">
        <RuleList rules={rules} type="flight" onMutated={handleMutated} />
      </TabsContent>
    </Tabs>
  )
}
