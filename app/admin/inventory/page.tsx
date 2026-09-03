/**
 * /admin/inventory — Verrous d'inventaire (journal d'audit read-only).
 *
 * Fixe un lien de navigation mort : "Inventaire Statique" pointait déjà
 * vers cette route (components/admin-shell.tsx::technicalNavItems),
 * jamais construite. Voir lib/admin/inventory-locks-actions.ts pour le
 * constat fait en même temps : le moteur de verrouillage
 * (lib/booking/inventory.ts) n'est actuellement appelé par aucun tunnel de
 * réservation réel — cette page reflète donc honnêtement le journal
 * existant, jamais une donnée fabriquée.
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Database } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InventoryLocksTable } from "@/components/admin/inventory-locks-table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listInventoryLocks } from "@/lib/admin/inventory-locks-actions"

export const metadata: Metadata = {
  title: "Verrous d'inventaire — Admin",
  description: "Journal d'audit des verrous de réservation.",
}

export const dynamic = "force-dynamic"

export default async function InventoryLocksPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/inventory")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const result = await listInventoryLocks()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Database className="h-6 w-6" />
          Verrous d&apos;inventaire
        </h1>
        <p className="text-muted-foreground text-sm">
          Journal d&apos;audit des verrous posés pendant le tunnel de réservation (Redis reste la source de
          décision — voir lib/booking/inventory.ts).
        </p>
      </div>

      {!result.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">Erreur</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">{result.error}</CardContent>
        </Card>
      ) : (
        <InventoryLocksTable locks={result.locks} />
      )}
    </div>
  )
}
