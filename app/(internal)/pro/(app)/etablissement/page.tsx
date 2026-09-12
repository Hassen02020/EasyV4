import { Building2 } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { EtablissementForm } from "@/components/pro/etablissement-form"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"

export const metadata = { title: "Établissement | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

const FALLBACK = {
  name: "Silianos & Kesra Test",
  contactEmail: "silianos.kesra@example.tn",
  contactPhone: "+216 71 555 000",
  fax: "+216 71 555 001",
  matriculeFiscale: "1399210Z/A/M/002",
  registreCommerce: "B01234567 2024",
  address: "12, Avenue Habib Bourguiba, 1001 Tunis, Tunisie",
  logoUrl: "",
  defaultLanguage: "fr",
  defaultCurrency: "TND",
  maskCredit: false,
}

export default async function ProEtablissementPage() {
  // Phase 9 : lecture de l'agence depuis `agencies` via le profil B2B.
  let initial = { ...FALLBACK }
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const profile = await getCurrentPartnerProfile(user.id)
      if (profile) {
        initial = {
          name: profile.agency.brandName ?? profile.agency.name,
          contactEmail: profile.agency.contactEmail ?? "",
          contactPhone: profile.agency.contactPhone ?? "",
          fax: profile.agency.fax ?? "",
          matriculeFiscale: profile.agency.matriculeFiscale ?? "",
          registreCommerce: profile.agency.registreCommerce ?? "",
          address: profile.agency.address ?? "",
          logoUrl: profile.agency.logoUrl ?? "",
          defaultLanguage: profile.agency.defaultLanguage,
          defaultCurrency: profile.agency.defaultCurrency,
          maskCredit: profile.agency.maskCredit,
        }
      }
    }
  } catch (err) {
    console.error("[etablissement] fallback", err)
  }

  return (
    <ProPageShell
      icon={Building2}
      title="Informations de l'établissement"
      iconTone="secondary"
      description="Coordonnées légales, identifiants fiscaux et préférences d'affichage."
    >
      <EtablissementForm initial={initial} />
    </ProPageShell>
  )
}
