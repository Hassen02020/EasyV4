/**
 * Layout du portail B2B (`/pro/*`) — Espace Pro Easy2Book.
 *
 *  1. Vérifie la session Supabase (middleware redirige déjà les anonymes
 *     vers `/pro/login`, mais on re-vérifie ici en defense-in-depth).
 *  2. Récupère le profil partenaire B2B (ou super_admin en preview).
 *  3. Pour un super_admin sans agence partenaire seedée → fallback admin.
 *  4. Rend `ProHeader` + content + `ProFooter`.
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { ProHeader } from "@/components/pro/pro-header"
import { ProFooter } from "@/components/pro/pro-footer"

export const dynamic = "force-dynamic"

function computeInitials(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return "E2"
  const parts = trimmed.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return trimmed.slice(0, 2).toUpperCase()
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export default async function ProLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/pro/login?next=/pro")
  }

  const profile = await getCurrentPartnerProfile(user.id)

  if (!profile) {
    // Utilisateur connecté mais sans rôle partenaire (ni super_admin avec
    // agence seedée) → renvoie vers /admin si c'est un staff Easy2Book.
    redirect("/admin")
  }

  const displayName =
    profile.agency.brandName ??
    profile.agency.name ??
    profile.name ??
    profile.email.split("@")[0] ??
    "Partenaire"

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <ProHeader
        user={{
          displayName,
          email: profile.email,
          initials: computeInitials(displayName),
          role: profile.role,
          isAdminPreview: profile.isAdminPreview,
        }}
        agency={{
          name: profile.agency.name,
          brandName: profile.agency.brandName,
          logoUrl: profile.agency.logoUrl,
          defaultLanguage: profile.agency.defaultLanguage,
          defaultCurrency: profile.agency.defaultCurrency,
          maskCredit: profile.agency.maskCredit,
          depositBalance: profile.agency.depositBalance,
          creditLowThreshold: profile.agency.creditLowThreshold,
        }}
      />
      <main className="flex-1">{children}</main>
      <ProFooter />
    </div>
  )
}
