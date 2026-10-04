/**
 * FX-ADMIN-01 — Gestion des politiques FX Trésorerie.
 * /admin/fx-policy
 *
 * Réservé super_admin.
 * Permet de créer et désactiver les entrées `fx_policies` —
 * table requise par getActiveFxPolicy() pour valider les
 * bookings de vols non-TND (Duffel EUR/USD).
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listFxPolicies } from "@/lib/finance/fx-policy-actions"
import { FxPolicyManager } from "@/components/admin/fx-policy-manager"

export const metadata: Metadata = {
  title: "Politique FX | Admin Easy2Book",
}

export const dynamic = "force-dynamic"

export default async function FxPolicyPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/fx-policy")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const policies = await listFxPolicies()
  const activeCount = policies.filter(
    (p) =>
      p.effectiveFrom <= new Date() &&
      (p.effectiveTo === null || p.effectiveTo > new Date()),
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Politique FX Trésorerie
        </h1>
        <p className="text-muted-foreground mt-1">
          Correction du taux de référence et frais bancaire pour les virements
          en devises étrangères (Duffel EUR/USD → TND).{" "}
          {activeCount === 0 ? (
            <span className="text-destructive font-medium">
              ⚠ Aucune politique active — les confirmations de vol non-TND sont
              bloquées (fail-closed).
            </span>
          ) : (
            <span className="font-medium text-emerald-600">
              {activeCount} politique active.
            </span>
          )}{" "}
          Réservé super_admin (CURRENCY-DIM-02).
        </p>
      </div>
      <FxPolicyManager initial={policies} />
    </div>
  )
}
