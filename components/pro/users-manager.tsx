"use client"

/**
 * Utilisateurs de l'agence partenaire (Phase 23) — remplace l'ancienne
 * version 100% mock (inviter/désactiver/supprimer en `useState` local,
 * aucune écriture DB, cf. git history) par de vrais contrôles :
 *
 *  - Suspendre/réactiver un `partner_agent` → `setPartnerAgentStatus`
 *    (lib/auth/partner-agent-actions.ts), déjà gated côté serveur par le
 *    grant explicite "staff.edit" (jamais automatique du seul rôle owner).
 *  - Déléguer une permission à un `partner_agent` → `PermissionGrantEditor`
 *    (composant partagé avec /admin/staff), limité à
 *    `delegatablePermissions` (PARTNER_DELEGATABLE_PERMISSIONS).
 *
 * L'invitation (création de compte) et la suppression restent hors
 * périmètre (nécessitent l'API Admin Supabase, voir lib/admin/users-
 * actions.ts::createStaffUser côté OTA) — jamais affichées ici comme des
 * contrôles qui ne font rien : mieux vaut une page plus courte qu'un faux
 * bouton (cf. mission Phase 23, "Remove all fake/toast-only controls").
 *
 * `canManage` ne fait qu'afficher/masquer les contrôles — la vraie porte
 * est toujours re-vérifiée côté serveur dans chaque Server Action.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mail, Shield, ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PermissionGrantEditor, type PermissionOverrideRow } from "@/components/permissions/permission-grant-editor"
import { setPartnerAgentStatus } from "@/lib/auth/partner-agent-actions"
import type { Permission } from "@/lib/auth/permissions"

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
  /** true seulement pour un partner_owner détenant le grant "staff.edit" — sinon lecture seule. */
  canManage: boolean
  currentUserId: string
  delegatablePermissions: readonly Permission[]
  agentBaseline: readonly Permission[]
  grantsByUser: Record<string, PermissionOverrideRow[]>
}

export function UsersManager({
  initial,
  canManage,
  currentUserId,
  delegatablePermissions,
  agentBaseline,
  grantsByUser,
}: UsersManagerProps) {
  const router = useRouter()
  const [rows, setRows] = useState<PartnerUserRow[]>(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggleActive(row: PartnerUserRow) {
    setPendingId(row.id)
    startTransition(async () => {
      const result = await setPartnerAgentStatus({
        targetUserId: row.id,
        status: row.isActive ? "suspended" : "active",
      })
      setPendingId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isActive: !r.isActive } : r)),
      )
      toast.success(row.isActive ? `${row.fullName} suspendu.` : `${row.fullName} réactivé.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <section className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Nom</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Rôle</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="font-semibold">Dernière connexion</TableHead>
              {canManage ? (
                <TableHead className="text-center font-semibold">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 6 : 5}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucun utilisateur dans votre agence.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => {
                const isSelf = u.id === currentUserId
                const canManageThisRow = canManage && u.role === "partner_agent" && !isSelf

                return (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      {u.fullName}
                      {isSelf ? <span className="text-muted-foreground ml-1 text-xs">(vous)</span> : null}
                    </TableCell>
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
                            ? "inline-flex items-center gap-1 border-emerald-300 bg-emerald-100 text-emerald-900"
                            : "inline-flex items-center gap-1 border-zinc-300 bg-zinc-100 text-zinc-700"
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
                    {canManage ? (
                      <TableCell>
                        <div className="flex items-center justify-center gap-1.5">
                          {canManageThisRow ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={pendingId === u.id}
                                onClick={() => toggleActive(u)}
                              >
                                {pendingId === u.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : u.isActive ? (
                                  "Suspendre"
                                ) : (
                                  "Réactiver"
                                )}
                              </Button>
                              <PermissionGrantEditor
                                targetUserId={u.id}
                                displayName={u.fullName}
                                permissions={delegatablePermissions}
                                baseline={agentBaseline}
                                initialOverrides={grantsByUser[u.id] ?? []}
                                triggerLabel="Déléguer"
                              />
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </section>
      {!canManage ? (
        <p className="text-muted-foreground text-xs">
          Lecture seule — la gestion des agents (statut, permissions) est réservée au propriétaire de l&apos;agence,
          une fois autorisé par Easy2Book.
        </p>
      ) : null}
    </div>
  )
}
