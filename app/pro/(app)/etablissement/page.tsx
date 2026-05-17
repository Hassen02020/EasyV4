import { Building2 } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { EtablissementForm } from "@/components/pro/etablissement-form"

export const metadata = { title: "Établissement | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default function ProEtablissementPage() {
  // TODO Phase 9 : lire depuis `agencies` via getCurrentPartnerProfile()
  const initial = {
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
