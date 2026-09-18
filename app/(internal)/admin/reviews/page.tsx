/**
 * Avis clients — modération (`/admin/reviews`). Réservé à super_admin/
 * manager (voir lib/admin/reviews-actions.ts::assertProductManager) —
 * approuver/rejeter engage la réputation publique de la plateforme,
 * pas une tâche de support courante.
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listReviewsForModeration } from "@/lib/admin/reviews-actions"
import { ReviewsModerationTable } from "@/components/admin/reviews-moderation-table"

export const metadata: Metadata = {
  title: "Avis clients — Admin",
  description: "Modération des avis clients avant publication.",
}

export const dynamic = "force-dynamic"

export default async function AdminReviewsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/reviews")
  }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !["super_admin", "manager"].includes(profile.role)) {
    redirect("/admin")
  }

  const result = await listReviewsForModeration()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Star className="h-6 w-6" />
          Avis clients
        </h1>
        <p className="text-muted-foreground text-sm">
          Un avis n&apos;est visible publiquement qu&apos;après approbation — jamais automatique.
        </p>
      </div>

      {!result.ok ? (
        <Card>
          <CardContent className="text-destructive py-6 text-sm">{result.error}</CardContent>
        </Card>
      ) : (
        <ReviewsModerationTable reviews={result.reviews} />
      )}
    </div>
  )
}
