/**
 * COMMERCIAL-RULES-ADMIN-01 — Gestion des règles commerciales DB-driven.
 * /admin/commercial-rules
 *
 * Réservé super_admin.
 * Permet de créer, activer/désactiver et supprimer les entrées
 * hotel_commercial_rules et flight_commercial_rules.
 *
 * Sans règle active = fallback automatique vers pricing_margins (comportement
 * safe par conception — aucun booking ne bloque). Avec règle active = le
 * moteur (lib/hotels/commercial-engine.ts, lib/vols/commercial-engine.ts)
 * remplace pricing_margins pour les offres correspondant au productScope.
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listCommercialRules } from "@/lib/admin/commercial-rules-actions"
import { CommercialRulesManager } from "@/components/admin/commercial-rules-manager"

export const metadata: Metadata = {
  title: "Règles commerciales | Admin Easy2Book",
}

export const dynamic = "force-dynamic"

export default async function CommercialRulesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/commercial-rules")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const rules = await listCommercialRules()

  const hotelActive = rules.filter(
    (r) => r.type === "hotel" && r.isActive,
  ).length
  const flightActive = rules.filter(
    (r) => r.type === "flight" && r.isActive,
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Règles commerciales
        </h1>
        <p className="text-muted-foreground mt-1">
          Moteur DB-driven de marge hôtels (
          <code className="bg-muted rounded px-1 text-xs">
            hotel_commercial_rules
          </code>
          ) et vols (
          <code className="bg-muted rounded px-1 text-xs">
            flight_commercial_rules
          </code>
          ).{" "}
          {hotelActive === 0 && flightActive === 0 ? (
            <span className="text-muted-foreground">
              Aucune règle active — fallback{" "}
              <code className="bg-muted rounded px-1 text-xs">
                pricing_margins
              </code>{" "}
              en vigueur.
            </span>
          ) : (
            <span className="font-medium text-emerald-600">
              {hotelActive} règle{hotelActive !== 1 ? "s" : ""} hôtel active
              {hotelActive !== 1 ? "s" : ""} · {flightActive} règle
              {flightActive !== 1 ? "s" : ""} vol active
              {flightActive !== 1 ? "s" : ""}.
            </span>
          )}{" "}
          Réservé super_admin (COMMERCIAL-RULES-ADMIN-01).
        </p>
      </div>
      <CommercialRulesManager initial={rules} />
    </div>
  )
}
