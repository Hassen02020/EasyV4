import { Suspense } from "react"
import { LoginForm } from "@/components/login-form"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import Link from "next/link"

export const metadata = {
  title: "Connexion — Easy2Book Admin",
  description: "Connexion à l'espace administrateur Easy2Book",
}

export default function LoginPage() {
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
            <Easy2BookLogo
              className="e2b-logo-pulse h-20 w-20"
              priority
            />
          </Link>
          <h1 className="text-foreground mt-6 text-2xl font-semibold tracking-tight">
            Connexion Back-office
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Accès réservé aux administrateurs Easy2Book
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-card shadow-e2b-soft h-64 animate-pulse rounded-2xl border" />
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          En cas de problème de connexion, contactez{" "}
          <a
            href="mailto:tarhouni.hassene@gmail.com"
            className="text-primary font-medium hover:underline"
          >
            le support
          </a>
          .
        </p>
      </div>
    </main>
  )
}
