/**
 * Accords commerciaux (`commercial_agreements`) — Super Admin uniquement.
 * AGREEMENT-01 — voir docs/ECONOMIC_MODEL.md §2 et
 * lib/admin/commercial-agreements-actions.ts.
 *
 * AUCUN accord réel/permanent n'est créé par ce chantier — mécanisme
 * uniquement, le premier accord réel Network est BLOQUÉ sur la décision
 * Direction du taux D-01b (voir docs/ROADMAP.md).
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listCommercialAgreements } from "@/lib/admin/commercial-agreements-actions"
import { CommercialAgreementsManager } from "@/components/admin/commercial-agreements-manager"

export const metadata: Metadata = {
  title: "Accords commerciaux — Super Admin",
  description: "Gestion des accords commerciaux (commercial_agreements)",
}

export const dynamic = "force-dynamic"

export default async function CommercialAgreementsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/accords-commerciaux")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const rows = await listCommercialAgreements()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Accords commerciaux</h1>
        <p className="text-muted-foreground mt-1">
          Qui vend / possède / fournit, rôle d&apos;Easy2Book, canal — {rows.length} accord
          {rows.length !== 1 ? "s" : ""}. Réservé super_admin ([D-01a]).
        </p>
      </div>
      <CommercialAgreementsManager initial={rows} />
    </div>
  )
}
