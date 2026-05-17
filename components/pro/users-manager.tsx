"use client"

import { useState } from "react"
import {
  Mail,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  CheckCircle2,
  XCircle,
  Pencil,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type PartnerUserRow = {
  id: string
  email: string
  fullName: string
  role: "partner_owner" | "partner_agent"
  isActive: boolean
  lastLoginAt: string | null
}

interface UsersManagerProps {
  initial: PartnerUserRow[]
  /** Max d'agents activables (le owner ne compte pas). Limite agence. */
  maxAgents?: number
}

export function UsersManager({ initial, maxAgents = 5 }: UsersManagerProps) {
  const [rows, setRows] = useState<PartnerUserRow[]>(initial)
  const [showInvite, setShowInvite] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState({
    email: "",
    fullName: "",
    role: "partner_agent" as PartnerUserRow["role"],
  })

  const activeAgentsCount = rows.filter(
    (r) => r.role === "partner_agent" && r.isActive,
  ).length
  const quotaFull = activeAgentsCount >= maxAgents

  function invite(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.email.trim() || !draft.fullName.trim()) return
    setSubmitting(true)
    setTimeout(() => {
      setRows((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          email: draft.email.trim().toLowerCase(),
          fullName: draft.fullName.trim(),
          role: draft.role,
          isActive: true,
          lastLoginAt: null,
        },
      ])
      setSubmitting(false)
      setShowInvite(false)
      setDraft({ email: "", fullName: "", role: "partner_agent" })
      toast.success("Invitation envoyée (mock — phase 9 : magic link Supabase)")
    }, 600)
  }

  function toggleActive(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r)),
    )
  }

  function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    toast.message("Utilisateur supprimé (mock)")
  }

  return (
    <div className="space-y-4">
      <section className="bg-card border-border/60 shadow-e2b-soft flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-foreground text-sm font-semibold">
            Quota agents : {activeAgentsCount} / {maxAgents}
          </h2>
          <p className="text-muted-foreground text-xs">
            Le compte Owner n&apos;est pas compté dans le quota. Désactivez
            un agent pour libérer une place.
          </p>
        </div>
        <Button
          onClick={() => setShowInvite((s) => !s)}
          disabled={quotaFull && !showInvite}
          className="rounded-xl"
        >
          <UserPlus className="mr-1.5 h-4 w-4" />
          {showInvite ? "Annuler" : "Inviter un agent"}
        </Button>
      </section>

      {showInvite ? (
        <form
          onSubmit={invite}
          className="bg-card border-border/60 shadow-e2b-soft grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_1fr_180px_auto]"
        >
          <div>
            <Label className="text-xs">Nom complet *</Label>
            <Input
              value={draft.fullName}
              onChange={(e) =>
                setDraft((p) => ({ ...p, fullName: e.target.value }))
              }
              placeholder="Ex : Karim Trabelsi"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Email *</Label>
            <Input
              type="email"
              value={draft.email}
              onChange={(e) =>
                setDraft((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="agent@agence.tn"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Rôle</Label>
            <Select
              value={draft.role}
              onValueChange={(v) =>
                setDraft((p) => ({ ...p, role: v as typeof p.role }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="partner_agent">Agent</SelectItem>
                <SelectItem value="partner_owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-xl w-full md:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Envoi…
                </>
              ) : (
                <>
                  <Mail className="mr-1.5 h-4 w-4" />
                  Envoyer l&apos;invitation
                </>
              )}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Nom</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Rôle</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="font-semibold">Dernière connexion</TableHead>
              <TableHead className="text-center font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-12 text-center">
                  Aucun utilisateur. Invitez votre premier agent.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{u.fullName}</TableCell>
                  <TableCell>
                    <a
                      href={`mailto:${u.email}`}
                      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm"
                    >
                      <Mail className="h-3 w-3" />
                      {u.email}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        u.role === "partner_owner"
                          ? "border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1"
                          : "border-secondary/40 bg-secondary/10 text-secondary inline-flex items-center gap-1"
                      }
                    >
                      {u.role === "partner_owner" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <Shield className="h-3 w-3" />
                      )}
                      {u.role === "partner_owner" ? "Owner" : "Agent"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        u.isActive
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900 inline-flex items-center gap-1"
                          : "border-zinc-300 bg-zinc-100 text-zinc-700 inline-flex items-center gap-1"
                      }
                    >
                      {u.isActive ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {u.isActive ? "Actif" : "Désactivé"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {u.lastLoginAt ?? "Jamais"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => toggleActive(u.id)}
                        title={u.isActive ? "Désactiver" : "Réactiver"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-7 w-7"
                        onClick={() => remove(u.id)}
                        title="Supprimer"
                        disabled={u.role === "partner_owner"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
