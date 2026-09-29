/**
 * /admin/suppliers/nodes/[id] — Détail d'un nœud fournisseur (Phase 35 /
 * NETWORK-01) : identité, statut, utilisateurs portail + invitation.
 */
import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Mail, Globe2, Phone, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { withSystemContext } from "@/lib/db/tenant-context"
import { supplierNodes } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { listPortalUsersForNode } from "@/lib/suppliers/portal-actions"
import { InviteSupplierPortalUserDialog } from "@/components/admin/invite-supplier-portal-user-dialog"

export const metadata: Metadata = {
  title: "Détail nœud fournisseur — Portail Easy2Book",
}

export const dynamic = "force-dynamic"

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
}

export default async function SupplierNodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/suppliers/nodes/${id}`)

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") redirect("/admin")

  const [node] = await withSystemContext((db) =>
    db.select().from(supplierNodes).where(eq(supplierNodes.id, id)).limit(1),
  )
  if (!node) notFound()

  const portalUsers = await listPortalUsersForNode(id)
  const modules = (node.modules as string[]) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          {node.displayName}
        </h1>
        <p className="text-muted-foreground font-mono text-sm">{node.slug}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Identité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {node.shortDescription && (
              <p className="text-muted-foreground">{node.shortDescription}</p>
            )}
            {node.contactEmail && (
              <p className="flex items-center gap-2">
                <Mail className="text-muted-foreground h-4 w-4" />{" "}
                {node.contactEmail}
              </p>
            )}
            {node.contactPhone && (
              <p className="flex items-center gap-2">
                <Phone className="text-muted-foreground h-4 w-4" />{" "}
                {node.contactPhone}
              </p>
            )}
            {node.contactCountry && (
              <p className="flex items-center gap-2">
                <Globe2 className="text-muted-foreground h-4 w-4" />{" "}
                {node.contactCountry}
              </p>
            )}
            <div className="flex flex-wrap gap-1 pt-2">
              {modules.length === 0 ? (
                <span className="text-muted-foreground text-xs">
                  Aucun module
                </span>
              ) : (
                modules.map((m) => (
                  <Badge key={m} variant="outline" className="text-xs">
                    {m}
                  </Badge>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <ShieldCheck className="text-muted-foreground h-4 w-4" />
              <span className="text-xs">
                Portail : {node.portalEnabled ? "activé" : "désactivé"} · Statut
                : {node.onboardingStatus}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              Utilisateurs portail
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {portalUsers.length}
              </span>
            </CardTitle>
            <InviteSupplierPortalUserDialog nodeId={node.id} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Invité le</TableHead>
                  <TableHead>Accepté le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portalUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground py-8 text-center"
                    >
                      Aucun utilisateur portail invité.
                    </TableCell>
                  </TableRow>
                ) : (
                  portalUsers.map((pu) => (
                    <TableRow key={pu.id}>
                      <TableCell className="text-sm">
                        {pu.invitedEmail ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ROLE_LABEL[pu.role] ?? pu.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {pu.invitedAt
                          ? new Date(pu.invitedAt).toLocaleDateString("fr-FR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {pu.acceptedAt
                          ? new Date(pu.acceptedAt).toLocaleDateString("fr-FR")
                          : "En attente"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
