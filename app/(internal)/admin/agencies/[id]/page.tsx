/**
 * /admin/agencies/[id] — Configuration White Label d'une agence.
 *
 * Permet à un super_admin de configurer les champs white label :
 * brandName, logoUrl, primaryColor, domain.
 * Ces champs alimentent proxy.ts (routing tenant) + root-shell.tsx +
 * components/pro/layout.tsx (CSS --primary) + header.tsx (branding public).
 */

import type { Metadata } from "next"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { AgencyWhiteLabelForm } from "@/components/admin/agency-wl-form"

export const metadata: Metadata = { title: "White Label — Super Admin" }
export const dynamic = "force-dynamic"

async function loadAgency(userId: string, agencyId: string) {
  const [agency] = await withTenantContext(
    { agencyId: null, userId, isSuperAdmin: true },
    (tx) =>
      tx
        .select({
          id: agencies.id,
          name: agencies.name,
          slug: agencies.slug,
          agencyType: agencies.agencyType,
          brandName: agencies.brandName,
          logoUrl: agencies.logoUrl,
          primaryColor: agencies.primaryColor,
          domain: agencies.domain,
        })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1),
  )
  return agency ?? null
}

export default async function AgencyWhiteLabelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/agencies/${id}`)

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin/agencies")

  const agency = await loadAgency(user.id, id)
  if (!agency) notFound()

  const TYPE_LABEL: Record<string, string> = {
    ota: "OTA",
    partner: "Partenaire B2B",
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/agencies">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux agences
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <Globe className="text-muted-foreground h-6 w-6" />
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {agency.brandName ?? agency.name}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-muted-foreground text-sm">{agency.slug}</span>
            <Badge variant={agency.agencyType === "ota" ? "default" : "secondary"}>
              {TYPE_LABEL[agency.agencyType] ?? agency.agencyType}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration White Label</CardTitle>
          <CardDescription>
            Ces paramètres activent le portail de marque blanche de cette
            agence : domaine dédié, logo, nom de marque et couleur d&apos;accent.
            Une fois le domaine configuré, le portail public et le portail{" "}
            <code>/pro</code> adopteront automatiquement le branding de
            l&apos;agence pour les visiteurs de ce domaine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgencyWhiteLabelForm
            agencyId={agency.id}
            initial={{
              brandName: agency.brandName ?? "",
              logoUrl: agency.logoUrl ?? "",
              primaryColor: agency.primaryColor ?? "",
              domain: agency.domain ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
