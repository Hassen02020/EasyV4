/**
 * Admin — Gestion des demandes de recharge wallet B2B.
 *
 * Permet aux admins de valider ou rejeter les demandes de recharge
 * soumises par les agents B2B.
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Banknote,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { getDb } from "@/lib/db/client"
import { walletRechargeRequests, agencies, users } from "@/lib/db/schema"
import { AdminRechargeActions } from "@/components/admin/recharge-actions"

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

  const db = getDb()
  const requests = await db
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
    .limit(50)

  const pendingCount = requests.filter((r) => r.status === "pending").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
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

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Toutes les demandes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
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
                    const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending
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
                            <p className="text-xs text-red-500 mt-1">
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
                                ? new Date(req.reviewedAt).toLocaleDateString("fr-FR")
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
