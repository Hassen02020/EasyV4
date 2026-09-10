"use client"

/**
 * Éditeur de permissions déléguées (Phase 23) — réutilisé tel quel par
 * `/admin/staff` (super_admin -> personnel OTA, vocabulaire RBAC complet)
 * et `/pro/utilisateurs` (partner_owner autorisé -> ses partner_agent,
 * vocabulaire limité à PARTNER_DELEGATABLE_PERMISSIONS).
 *
 * N'implémente AUCUNE logique d'autorisation : appelle directement les
 * Server Actions existantes (`setDelegatedPermission`/
 * `removeDelegatedPermission`, lib/auth/permission-actions.ts) qui
 * relisent l'acteur depuis la session serveur et décident seules. Ce
 * composant ne fait qu'afficher le résultat et déclencher l'appel — la
 * même règle sert donc les deux dashboards sans jamais diverger.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  setDelegatedPermission,
  removeDelegatedPermission,
} from "@/lib/auth/permission-actions"
import type { Permission } from "@/lib/auth/permissions"

const CATEGORY_LABEL: Record<string, string> = {
  reservations: "Réservations",
  clients: "Clients",
  products: "Produits",
  accounting: "Comptabilité",
  staff: "Personnel",
  wallet: "Portefeuille",
  admin: "Administration",
}

function groupByCategory(permissions: readonly Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>()
  for (const p of permissions) {
    const category = p.split(".")[0]
    const list = groups.get(category) ?? []
    list.push(p)
    groups.set(category, list)
  }
  return [...groups.entries()]
}

export interface PermissionOverrideRow {
  permission: Permission
  granted: boolean
}

interface PermissionGrantEditorProps {
  targetUserId: string
  displayName: string
  /** Vocabulaire affiché — RBAC complet (admin) ou sous-ensemble délégable (pro). */
  permissions: readonly Permission[]
  baseline: readonly Permission[]
  initialOverrides: readonly PermissionOverrideRow[]
  triggerLabel?: string
}

export function PermissionGrantEditor({
  targetUserId,
  displayName,
  permissions,
  baseline,
  initialOverrides,
  triggerLabel = "Permissions",
}: PermissionGrantEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [overrides, setOverrides] = useState<Map<Permission, boolean>>(
    () => new Map(initialOverrides.map((o) => [o.permission, o.granted])),
  )
  const [pending, setPending] = useState<Permission | null>(null)
  const [, startTransition] = useTransition()

  const baselineSet = new Set(baseline)
  const groups = groupByCategory(permissions)

  function mutate(permission: Permission, action: "grant" | "revoke" | "reset") {
    setPending(permission)
    startTransition(async () => {
      const result =
        action === "reset"
          ? await removeDelegatedPermission({ targetUserId, permission })
          : await setDelegatedPermission({ targetUserId, permission, granted: action === "grant" })
      setPending(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setOverrides((prev) => {
        const next = new Map(prev)
        if (action === "reset") next.delete(permission)
        else next.set(permission, action === "grant")
        return next
      })
      toast.success(
        action === "reset"
          ? "Override retiré — retour au comportement du rôle."
          : action === "grant"
            ? "Permission accordée."
            : "Permission révoquée.",
      )
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissions de {displayName}</DialogTitle>
          <DialogDescription>
            « Base » = comportement du rôle. Un override est une exception explicite pour cet utilisateur uniquement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map(([category, perms]) => (
            <div key={category}>
              <h4 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                {CATEGORY_LABEL[category] ?? category}
              </h4>
              <div className="space-y-1">
                {perms.map((permission) => {
                  const override = overrides.get(permission)
                  const hasOverride = override !== undefined
                  const effective = hasOverride ? override : baselineSet.has(permission)
                  const isPending = pending === permission

                  return (
                    <div
                      key={permission}
                      className="border-border/60 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{permission}</span>
                        {hasOverride ? (
                          <Badge
                            variant="outline"
                            className={
                              override
                                ? "border-emerald-300 bg-emerald-100 text-[10px] text-emerald-900"
                                : "border-destructive/40 bg-destructive/10 text-destructive text-[10px]"
                            }
                          >
                            {override ? "Accordé (override)" : "Révoqué (override)"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {effective ? "Accès (base)" : "Aucun accès (base)"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            {!effective ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => mutate(permission, "grant")}
                              >
                                Accorder
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive h-6 px-2 text-xs"
                                onClick={() => mutate(permission, "revoke")}
                              >
                                Révoquer
                              </Button>
                            )}
                            {hasOverride ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                title="Retirer l'override, revenir au rôle"
                                onClick={() => mutate(permission, "reset")}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
