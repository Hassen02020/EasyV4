/**
 * Admin — Gestion des demandes de recharge wallet B2B.
 *
 * Permet aux admins de valider ou rejeter les demandes de recharge
 * soumises par les agents B2B.
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { and, desc, eq, ne, sql } from "drizzle-orm"
import { ArrowLeft, Banknote, Settings, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  walletRechargeRequests,
  agencies,
  customerTopupRequests,
  customers,
} from "@/lib/db/schema"
import { AdminRechargeActions } from "@/components/admin/recharge-actions"
import { CustomerTopupReviewActions } from "@/components/admin/customer-topup-review-actions"
import { getEffectivePermission } from "@/lib/auth/permissions"
import { TOPUP_REVIEWER_ROLES } from "@/lib/finance/customer-topup-manual-core"
import {
  TOPUP_METHOD_LABELS_FR,
  type TopupMethodKey,
} from "@/lib/finance/topup-method-display"

export const metadata: Metadata = {
  title: "Demandes de recharge — Admin",
}

export const dynamic = "force-dynamic"

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  bank_transfer: "Virement bancaire",
  postal_transfer: "Virement postal",
  postal_mandate: "Mandat postal",
  check: "Chèque",
  card_international: "CB internationale",
}

const TOPUP_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "secondary" | "outline"; className?: string }
> = {
  pending: {
    label: "À vérifier",
    variant: "outline",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  completed: {
    label: "Créditée",
    variant: "outline",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejetée",
    variant: "outline",
    className:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  },
  failed: { label: "Non aboutie", variant: "secondary" },
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" }
> = {
  pending: { label: "En attente", variant: "secondary" },
  validated: { label: "Validée", variant: "default" },
  rejected: { label: "Refusée", variant: "destructive" },
}

function formatTnd(v: number) {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

export default async function AdminRechargesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/accounting/recharges")

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_compta"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  // Vue cross-agence (file de recharges à valider, toutes agences) :
  // is_super_admin=true requis.
  const requests = await withTenantContext(
    { agencyId: null, userId: user.id, isSuperAdmin: true },
    (db) =>
      db
        .select({
          id: walletRechargeRequests.id,
          amount: walletRechargeRequests.amount,
          method: walletRechargeRequests.method,
          paymentReference: walletRechargeRequests.paymentReference,
          proofUrl: walletRechargeRequests.proofUrl,
          note: walletRechargeRequests.note,
          status: walletRechargeRequests.status,
          rejectionReason: walletRechargeRequests.rejectionReason,
          createdAt: walletRechargeRequests.createdAt,
          reviewedAt: walletRechargeRequests.reviewedAt,
          agencyName: agencies.name,
          agencyId: walletRechargeRequests.agencyId,
        })
        .from(walletRechargeRequests)
        .leftJoin(agencies, eq(walletRechargeRequests.agencyId, agencies.id))
        .orderBy(desc(walletRechargeRequests.createdAt))
        .limit(50),
  )

  const pendingCount = requests.filter((r) => r.status === "pending").length

  // WALLET-B2C-RECHARGE-METHODS-01 — recharges clients manuelles. super_admin :
  // toutes agences ; autres rôles : leur agence (RLS). Actions réservées aux
  // rôles de revue disposant de la permission effective (revérifiée côté
  // serveur à chaque action).
  const isSuperAdmin = profile.role === "super_admin"
  const canReviewTopups =
    profile.agencyType === "ota" &&
    (TOPUP_REVIEWER_ROLES as readonly string[]).includes(profile.role) &&
    (await getEffectivePermission({
      agencyId: profile.agencyId,
      userId: user.id,
      role: profile.role,
      permission: "wallet.topup.validate",
    }))
  const topups = await withTenantContext(
    {
      agencyId: isSuperAdmin ? null : profile.agencyId,
      userId: user.id,
      isSuperAdmin,
    },
    (db) =>
      db
        .select({
          id: customerTopupRequests.id,
          amount: customerTopupRequests.amount,
          method: customerTopupRequests.method,
          status: customerTopupRequests.status,
          customerReference: customerTopupRequests.customerReference,
          customerNote: customerTopupRequests.customerNote,
          rejectionReason: customerTopupRequests.rejectionReason,
          createdAt: customerTopupRequests.createdAt,
          reviewedAt: customerTopupRequests.reviewedAt,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
        })
        .from(customerTopupRequests)
        .leftJoin(customers, eq(customerTopupRequests.customerId, customers.id))
        .where(
          and(
            ne(customerTopupRequests.method, "card"),
            isSuperAdmin
              ? undefined
              : eq(customerTopupRequests.agencyId, profile.agencyId),
          ),
        )
        // Demandes à vérifier en tête : elles ne doivent jamais sortir de la
        // limite d'affichage derrière des demandes déjà traitées.
        .orderBy(
          sql`(${customerTopupRequests.status} = 'pending') desc`,
          desc(customerTopupRequests.createdAt),
        )
        .limit(50),
  )
  const topupPendingCount = topups.filter((r) => r.status === "pending").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Retour à la comptabilité"
        >
          <Link href="/admin/accounting">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Demandes de recharge wallet</h1>
          <p className="text-muted-foreground">
            {pendingCount > 0
              ? `${pendingCount} demande(s) en attente de validation`
              : "Aucune demande en attente"}
          </p>
        </div>
      </div>

      {/* Recharges clients B2C (moyens manuels) */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Recharges clients (virement, versement, espèces, D17)
            {topupPendingCount > 0 && (
              <Badge variant="secondary">{topupPendingCount} à vérifier</Badge>
            )}
          </CardTitle>
          {isSuperAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/accounting/recharges/moyens">
                <Settings className="mr-2 h-4 w-4" />
                Moyens et coordonnées
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {topups.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucune demande de recharge client.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Moyen</TableHead>
                    <TableHead>Référence / message</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topups.map((req) => {
                    const cfg =
                      TOPUP_STATUS_CONFIG[req.status] ??
                      TOPUP_STATUS_CONFIG.pending
                    const name =
                      [req.firstName, req.lastName].filter(Boolean).join(" ") ||
                      "Client"
                    const methodLabel =
                      TOPUP_METHOD_LABELS_FR[req.method as TopupMethodKey] ??
                      req.method
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <p className="font-medium">{name}</p>
                          <p className="text-muted-foreground text-xs">
                            {req.email ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {req.amount} DT
                        </TableCell>
                        <TableCell>{methodLabel}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs text-sm">
                          <p>{req.customerReference ?? "—"}</p>
                          {req.customerNote && (
                            <p className="text-xs">{req.customerNote}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(req.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={cfg.variant}
                            className={cfg.className}
                          >
                            {cfg.label}
                          </Badge>
                          {req.rejectionReason && (
                            <p className="mt-1 text-xs text-red-500">
                              {req.rejectionReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {req.status === "pending" && canReviewTopups ? (
                            <CustomerTopupReviewActions
                              requestId={req.id}
                              amount={req.amount}
                              customerLabel={name}
                              methodLabel={methodLabel}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {req.reviewedAt
                                ? new Date(req.reviewedAt).toLocaleDateString(
                                    "fr-FR",
                                  )
                                : "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table B2B */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Recharges agences B2B
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucune demande de recharge pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agence</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => {
                    const cfg =
                      STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {req.agencyName ?? "—"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatTnd(parseFloat(req.amount))} DT
                        </TableCell>
                        <TableCell>
                          {METHOD_LABELS[req.method] ?? req.method}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {req.paymentReference ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(req.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          {req.rejectionReason && (
                            <p className="mt-1 text-xs text-red-500">
                              {req.rejectionReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {req.status === "pending" ? (
                            <AdminRechargeActions
                              requestId={req.id}
                              adminUserId={user.id}
                              amount={parseFloat(req.amount)}
                              agencyName={req.agencyName ?? "Agence"}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {req.reviewedAt
                                ? new Date(req.reviewedAt).toLocaleDateString(
                                    "fr-FR",
                                  )
                                : "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
