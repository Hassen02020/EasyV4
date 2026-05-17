import { Building2 } from "lucide-react"
import { ProPageShell, ProPagePlaceholder } from "@/components/pro/pro-page-shell"

export const metadata = { title: "Établissement | Espace Pro Easy2Book" }

export default function ProEtablissementPage() {
  return (
    <ProPageShell
      icon={Building2}
      title="Informations de l'établissement"
      iconTone="secondary"
      description="Coordonnées légales, identifiants fiscaux et préférences d'affichage."
    >
      <ProPagePlaceholder
        title="Formulaire Établissement"
        hint="Saisie Matricule Fiscale (format 1399210Z/A/M/002 validé Zod), Registre commerce, adresse, logo, langue, devise — connecté à agencies en phase 8."
      />
    </ProPageShell>
  )
}
