"use client"

/**
 * UI minimale AGREEMENT-01 — création/liste des `commercial_agreements`.
 * Réservé super_admin (la page appelante redirige déjà les non-admins ;
 * l'action serveur revérifie via `requireSuperAdmin()` — défense en
 * profondeur, cf. lib/admin/commercial-agreements-actions.ts).
 *
 * Volontairement minimal (mécanisme, pas politique commerciale) : pas de
 * data-table tanstack, pas d'édition inline — création + liste + statut.
 */

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  createCommercialAgreement,
  setCommercialAgreementStatus,
  type CommercialAgreementRow,
} from "@/lib/admin/commercial-agreements-actions"

const PARTY_TYPES = ["agency", "supplier_node", "easy2book", "external"] as const
const EASY2BOOK_ROLES = ["platform", "distributor", "seller", "owner"] as const
const CHANNELS = ["b2c", "b2b", "network", "white_label", "api"] as const
const STATUSES = ["draft", "active", "suspended", "terminated"] as const

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  active: "default",
  suspended: "secondary",
  terminated: "destructive",
}

function PartySelect({
  label,
  required,
  type,
  setType,
  id,
  setId,
}: {
  label: string
  required?: boolean
  type: string
  setType: (v: string) => void
  id: string
  setId: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label>
          {label} — type{required ? " *" : ""}
        </Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {PARTY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{label} — id (uuid){required ? " *" : ""}</Label>
        <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="uuid" />
      </div>
    </div>
  )
}

export function CommercialAgreementsManager({ initial }: { initial: CommercialAgreementRow[] }) {
  const [rows, setRows] = React.useState(initial)
  const [loading, setLoading] = React.useState(false)

  const [sellerPartyType, setSellerPartyType] = React.useState<string>("agency")
  const [sellerPartyId, setSellerPartyId] = React.useState("")
  const [ownerPartyType, setOwnerPartyType] = React.useState<string>("")
  const [ownerPartyId, setOwnerPartyId] = React.useState("")
  const [supplierPartyType, setSupplierPartyType] = React.useState<string>("")
  const [supplierPartyId, setSupplierPartyId] = React.useState("")
  const [easy2bookRole, setEasy2bookRole] = React.useState<string>("platform")
  const [channel, setChannel] = React.useState<string>("network")
  const [currency, setCurrency] = React.useState("TND")
  const [payerRole, setPayerRole] = React.useState("customer")
  const [status, setStatus] = React.useState<string>("draft")
  const [validFrom, setValidFrom] = React.useState("")
  const [validTo, setValidTo] = React.useState("")

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!sellerPartyId) {
      toast.error("seller_party_id est requis")
      return
    }
    setLoading(true)
    try {
      const res = await createCommercialAgreement({
        sellerPartyType: sellerPartyType as (typeof PARTY_TYPES)[number],
        sellerPartyId,
        ownerPartyType: (ownerPartyType || undefined) as (typeof PARTY_TYPES)[number] | undefined,
        ownerPartyId: ownerPartyId || undefined,
        supplierPartyType: (supplierPartyType || undefined) as (typeof PARTY_TYPES)[number] | undefined,
        supplierPartyId: supplierPartyId || undefined,
        easy2bookRole: easy2bookRole as (typeof EASY2BOOK_ROLES)[number],
        channel: channel as (typeof CHANNELS)[number],
        currency,
        payerRole,
        status: status as (typeof STATUSES)[number],
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
      })
      if (res.ok) {
        toast.success("Accord commercial créé")
        window.location.reload()
      } else {
        toast.error(res.error)
      }
    } catch {
      toast.error("Erreur réseau — réessayez")
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(id: string, next: string) {
    const res = await setCommercialAgreementStatus(id, next as (typeof STATUSES)[number])
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)))
      toast.success("Statut mis à jour")
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nouvel accord commercial</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <PartySelect
              label="Vendeur (seller)"
              required
              type={sellerPartyType}
              setType={setSellerPartyType}
              id={sellerPartyId}
              setId={setSellerPartyId}
            />
            <PartySelect
              label="Propriétaire (owner)"
              type={ownerPartyType}
              setType={setOwnerPartyType}
              id={ownerPartyId}
              setId={setOwnerPartyId}
            />
            <PartySelect
              label="Fournisseur (supplier)"
              type={supplierPartyType}
              setType={setSupplierPartyType}
              id={supplierPartyId}
              setId={setSupplierPartyId}
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Rôle Easy2Book *</Label>
                <Select value={easy2bookRole} onValueChange={setEasy2bookRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EASY2BOOK_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Canal *</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Devise</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </div>
              <div className="space-y-1">
                <Label>Qui paie (payer_role)</Label>
                <Input value={payerRole} onChange={(e) => setPayerRole(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Statut</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valide à partir de</Label>
                <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Valide jusqu&apos;à</Label>
                <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
              </div>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Création…" : "Créer l'accord"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accords existants ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendeur</TableHead>
                <TableHead>Rôle E2B</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    Aucun accord commercial pour l&apos;instant.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.sellerPartyName ?? r.sellerPartyId}
                    <span className="text-muted-foreground ml-1 text-xs">({r.sellerPartyType})</span>
                  </TableCell>
                  <TableCell>{r.easy2bookRole}</TableCell>
                  <TableCell>{r.channel}</TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(r.createdAt).toLocaleDateString("fr-TN")}</TableCell>
                  <TableCell>
                    <Select value={r.status} onValueChange={(v) => handleStatusChange(r.id, v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
