/**
 * /admin/suppliers — PHASE 27 : Master Admin Control Plane fournisseurs
 * hôteliers multi-tenant. Remplace la page cosmétique précédente (lisait
 * l'ancienne table `suppliers`, boutons sans handler) — même URL, contenu
 * entièrement réel : comptes/credentials chiffrés/autorisations réels via
 * `lib/hotel-suppliers/tenant/accounts.ts` (Server Actions, super_admin
 * uniquement, RLS `hotel_supplier_*`).
 *
 * Marque blanche : pas de portail séparé — un `manager`/`super_admin` sur
 * une agence `agencyType='ota'` avec `domain` non nul (marque blanche) est
 * déjà scopé par la RLS existante en tant qu'agence "propriétaire" comme
 * n'importe quelle autre — voir rapport final Phase 27, section G.
 */
import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Plug, CheckCircle, Ban, AlertTriangle, HelpCircle, Users2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  listAllSupplierAccounts,
  listHotelSuppliersCatalog,
  listAgenciesForPicker,
  listAuthorizationsForAccount,
} from "@/lib/hotel-suppliers/tenant/accounts"
import { CreateSupplierAccountDialog } from "@/components/admin/suppliers/create-supplier-account-dialog"
import { SupplierAccountRowActions } from "@/components/admin/suppliers/supplier-account-row-actions"

export const metadata: Metadata = {
  title: "Fournisseurs hôteliers — Master Admin",
  description: "Comptes fournisseur multi-tenant (myGo, Tunisia Bed, Cyberesa, 3T)",
}

export const dynamic = "force-dynamic"

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
  active: { label: "Actif", className: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  disabled: { label: "Désactivé", className: "bg-gray-100 text-gray-800", icon: Ban },
  invalid_credentials: { label: "Identifiants invalides", className: "bg-red-100 text-red-800", icon: AlertTriangle },
  not_configured: { label: "Non configuré", className: "bg-gray-100 text-gray-600", icon: HelpCircle },
  error: { label: "Erreur", className: "bg-red-100 text-red-800", icon: AlertTriangle },
}

const OWNER_TYPE_LABEL: Record<string, string> = {
  master: "Master",
  agency: "Agence",
  whitelabel: "Marque blanche",
}

const DOC_STATUS_LABEL: Record<string, string> = {
  documented: "Documenté",
  documentation_required: "Documentation requise",
}

export default async function SuppliersPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/suppliers")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") redirect("/admin")

  const [catalog, accounts, agencyOptions] = await Promise.all([
    listHotelSuppliersCatalog(),
    listAllSupplierAccounts(),
    listAgenciesForPicker(),
  ])

  const authorizationsByAccount = new Map<string, { id: string; agencyId: string; agencyName: string }[]>()
  await Promise.all(
    accounts
      .filter((a) => a.ownerType === "master")
      .map(async (a) => {
        authorizationsByAccount.set(a.id, await listAuthorizationsForAccount(a.id))
      }),
  )

  const creatableSuppliers = catalog.map((s) => ({ id: s.id, code: s.code, name: s.name, documentationStatus: s.documentationStatus }))
  const agencyPickerOptions = agencyOptions.map((a) => ({ id: a.id, name: a.name, agencyType: a.agencyType, domain: a.domain }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Fournisseurs hôteliers</h1>
          <p className="text-muted-foreground mt-1">
            Comptes fournisseur multi-tenant — master, agences partenaires et marques blanches, chacun avec ses propres
            identifiants chiffrés, exécutés via un unique driver par fournisseur.
          </p>
        </div>
        <CreateSupplierAccountDialog suppliers={creatableSuppliers} agencies={agencyPickerOptions} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {catalog.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{s.name}</CardTitle>
              <Plug className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{accounts.filter((a) => a.supplierId === s.id).length}</p>
              <Badge variant="outline" className="mt-1">
                {DOC_STATUS_LABEL[s.documentationStatus] ?? s.documentationStatus}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comptes fournisseur</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Compte</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Propriétaire</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Priorité</TableHead>
                  <TableHead>Dernier test</TableHead>
                  <TableHead>Partage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                      Aucun compte fournisseur configuré. Commencez par en créer un.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((a) => {
                    const statusConfig = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.not_configured
                    const StatusIcon = statusConfig!.icon
                    const authorizedAgencies = authorizationsByAccount.get(a.id) ?? []
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
                              <Plug className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{a.displayName}</p>
                              <p className="text-muted-foreground text-xs">{a.agencyName}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.supplierName}</Badge>
                        </TableCell>
                        <TableCell>{OWNER_TYPE_LABEL[a.ownerType] ?? a.ownerType}</TableCell>
                        <TableCell>
                          <Badge className={statusConfig!.className}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusConfig!.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{a.mode}</TableCell>
                        <TableCell className="text-sm">{a.priority}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {a.lastTestedAt ? new Date(a.lastTestedAt).toLocaleString("fr-FR") : "Jamais"}
                          {a.lastTestStatus ? ` · ${a.lastTestStatus}` : ""}
                        </TableCell>
                        <TableCell>
                          {a.ownerType === "master" ? (
                            <Badge variant="outline">
                              <Users2 className="mr-1 h-3 w-3" />
                              {a.authorizedAgencyCount} agence(s)
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <SupplierAccountRowActions
                            accountId={a.id}
                            displayName={a.displayName}
                            status={a.status}
                            ownerType={a.ownerType}
                            agencies={agencyPickerOptions}
                            authorizedAgencies={authorizedAgencies}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
