import { Suspense } from "react"
import Link from "next/link"
import { ProLoginForm } from "@/components/pro/pro-login-form"
import { Easy2BookLogo } from "@/components/easy2book-logo"

export const metadata = {
  title: "Espace Pro — Connexion | Easy2Book",
  description: "Connexion à l'Espace Pro Easy2Book — Agences partenaires B2B",
}

export default function ProLoginPage() {
  return (
    <main className="from-background via-background to-accent/10 relative flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12">
      <div
        aria-hidden
        className="bg-primary/15 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-secondary/20 absolute -right-20 -bottom-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div className="e2b-fade-in-up relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Link
            href="/"
            aria-label="Retour à l'accueil Easy2Book"
            className="group"
          >
            <Easy2BookLogo className="e2b-logo-pulse h-20 w-20" priority />
          </Link>
          <h1 className="text-foreground mt-6 text-2xl font-semibold tracking-tight">
            Espace Pro
          </h1>
          <p className="text-muted-foreground mt-1 text-center text-sm">
            Connexion réservée aux agences partenaires Easy2Book
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-card shadow-e2b-soft h-72 animate-pulse rounded-2xl border" />
          }
        >
          <ProLoginForm />
        </Suspense>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs">
          <p className="text-muted-foreground">
            Pas encore partenaire ?{" "}
            <a
              href="mailto:partenaires@easy2book.tn"
              className="text-primary font-medium hover:underline"
            >
              Demander l&apos;ouverture d&apos;un compte
            </a>
          </p>
          <p className="text-muted-foreground/80">
            Vous êtes membre du staff Easy2Book ?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Aller à la connexion staff
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
