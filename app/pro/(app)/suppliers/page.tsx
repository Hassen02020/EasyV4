/**
 * /pro/suppliers — PHASE 27 : portail Agence des comptes fournisseur
 * hôteliers. Scope strict à SA PROPRE agence (RLS `hotel_supplier_*`) : ses
 * propres comptes + les comptes partagés explicitement autorisés pour elle
 * (jamais un accès implicite à un compte MASTER, jamais visibilité sur les
 * comptes d'une autre agence). Écriture réservée à `partner_owner` — lecture
 * + test de connexion ouverts à `partner_agent` (même logique que
 * /pro/utilisateurs : la distinction owner/agent est opérationnelle, pas de
 * partition de visibilité).
 */
import { redirect } from "next/navigation"
import { Plug } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { SupplierAccountsManager } from "@/components/pro/supplier-accounts-manager"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import {
  listAgencyVisibleSupplierAccounts,
  listHotelSuppliersCatalogForAgency,
} from "@/lib/hotel-suppliers/tenant/agency-accounts"

export const metadata = { title: "Fournisseurs hôteliers | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProSuppliersPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login?next=/pro/suppliers")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const isValidPartnerRole =
    profile.role === "partner_owner" || profile.role === "partner_agent" || profile.role === "super_admin"
  if (!isValidPartnerRole) {
    redirect("/pro?forbidden=suppliers")
  }

  const [accounts, catalog] = await Promise.all([
    listAgencyVisibleSupplierAccounts(),
    listHotelSuppliersCatalogForAgency(),
  ])

  const canManage = profile.role === "partner_owner" || profile.role === "super_admin"

  return (
    <ProPageShell
      icon={Plug}
      title="Fournisseurs hôteliers"
      iconTone="secondary"
      description={
        canManage
          ? "Vos propres comptes fournisseur (identifiants chiffrés) et les comptes partagés que Easy2Book vous a explicitement autorisé à utiliser."
          : "Comptes fournisseur disponibles pour votre agence."
      }
    >
      <SupplierAccountsManager
        accounts={accounts}
        suppliers={catalog.map((s) => ({ id: s.id, code: s.code, name: s.name, documentationStatus: s.documentationStatus }))}
        canManage={canManage}
      />
    </ProPageShell>
  )
}
