/**
 * Détail Omra autorisé + réservation — /pro/produits/omra/[id]
 * (Phase 13.2, gap #1).
 *
 * Remplace `/pro/sandbox` comme point d'entrée B2B Omra réel :
 * `B2B Agency → /pro/produits → Authorized Omra → Omra details → formulaire
 * pèlerin existant → createOmraBooking`. Ni le package ni les départs ne
 * sont filtrés par `agencyId` dans la requête — exactement comme
 * `createOmraBooking` lui-même (lib/omra/booking-actions.ts), on laisse
 * la RLS élargie (0023_commerce_completion.sql : propriétaire OU
 * `product_authorizations` actif) décider si cette agence peut voir ce
 * package. Une agence non autorisée obtient donc naturellement un 404
 * (aucune ligne visible), pas une erreur d'autorisation explicite qui
 * confirmerait l'existence du produit à qui ne devrait pas la connaître.
 */

import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Moon } from "lucide-react"
import { and, eq, gte } from "drizzle-orm"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"
import { omraPackages, omraAllotments } from "@/lib/db/schema"
import { OmraPartnerBookingForm } from "@/components/omra/omra-partner-booking-form"

export const metadata = { title: "Réservation Omra | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

async function getAuthorizedOmraPackage(id: string) {
  const session = await resolveSessionContext()
  if (!session.ok || !session.agencyId) return null

  return withTenantContext(
    { agencyId: session.agencyId, userId: session.userId, isSuperAdmin: session.isSuperAdmin },
    async (tx) => {
      const [pkg] = await tx
        .select()
        .from(omraPackages)
        .where(and(eq(omraPackages.id, id), eq(omraPackages.status, "published")))
        .limit(1)
      if (!pkg) return null
      if (!pkg.channels?.includes("b2b")) return null

      const allotments = await tx
        .select()
        .from(omraAllotments)
        .where(
          and(
            eq(omraAllotments.packageId, id),
            eq(omraAllotments.status, "active"),
            gte(omraAllotments.availableCount, 1),
          ),
        )
        .orderBy(omraAllotments.departureDate)

      return { pkg, allotments }
    },
  )
}

export default async function ProOmraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const { id } = await params
  const result = await getAuthorizedOmraPackage(id)
  if (!result) notFound()
  const { pkg, allotments } = result

  return (
    <ProPageShell
      icon={Moon}
      title={pkg.name}
      description={`${pkg.durationDays} jours — réservation de groupe, débit compte de dépôt`}
      actions={
        <Link
          href="/pro/produits"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Retour aux produits
        </Link>
      }
    >
      {allotments.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun départ n&apos;est ouvert à la réservation pour ce programme actuellement.
        </div>
      ) : (
        <OmraPartnerBookingForm
          packageId={pkg.id}
          packageName={pkg.name}
          basePrice={parseFloat(pkg.basePrice)}
          durationDays={pkg.durationDays}
          departures={allotments.map((a) => ({
            departureDate: a.departureDate,
            availableCount: a.availableCount,
            price: a.overridePrice ? parseFloat(a.overridePrice) : parseFloat(pkg.basePrice),
          }))}
        />
      )}
    </ProPageShell>
  )
}
