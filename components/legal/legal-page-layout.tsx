import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { AlertTriangle } from "lucide-react"

export interface LegalSection {
  heading: string
  paragraphs: string[]
}

/**
 * Layout partagé pour les pages légales (CGV, mentions légales, politique
 * de confidentialité). Le contenu est un placeholder générique en attente
 * du texte juridique réel fourni par l'équipe Easy2Book — voir le bandeau
 * d'avertissement ci-dessous, volontairement visible tant que ce texte
 * n'a pas été remplacé.
 */
export function LegalPageLayout({
  title,
  intro,
  sections,
}: {
  title: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
          <h1 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            Dernière mise à jour : à définir
          </p>

          <div className="border-warning/40 bg-warning/10 mt-6 flex items-start gap-3 rounded-2xl border p-4">
            <AlertTriangle className="text-warning-foreground mt-0.5 size-5 shrink-0" />
            <p className="text-warning-foreground text-sm leading-relaxed">
              <strong>Texte juridique à insérer ici.</strong> Cette page
              utilise un contenu générique de structure en attendant la
              version définitive rédigée et validée par Easy2Book. Ne pas
              considérer ce texte comme un engagement contractuel.
            </p>
          </div>

          <div className="bg-card shadow-e2b-soft mt-8 rounded-2xl border p-6 sm:p-8">
            <p className="text-foreground leading-relaxed">{intro}</p>

            <div className="mt-8 space-y-8">
              {sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-foreground text-xl font-semibold tracking-tight">
                    {section.heading}
                  </h2>
                  <div className="text-muted-foreground mt-3 space-y-3 leading-relaxed">
                    {section.paragraphs.map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

/** Paragraphe Lorem Ipsum générique utilisé comme texte de structure. */
export const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."

export const LOREM_2 =
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
