import { Suspense } from "react"
import { Metadata } from "next"
import Link from "next/link"
import { HeartHandshake, ArrowLeft } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { Easy2BookLogo } from "@/components/easy2book-logo"

export const metadata: Metadata = {
  title: "Connexion Mutuelle — Easy2Book",
  description: "Accès espace partenaires mutuelle et assurance voyage",
}

export default function MutuelleLoginPage() {
  return (
    <main className="from-background via-background to-violet-50/30 relative flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12">
      {/* Background blobs */}
      <div
        aria-hidden
        className="bg-violet-400/10 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-primary/10 absolute -right-20 -bottom-20 h-72 w-72 rounded-full blur-3xl"
      />

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100">
            <HeartHandshake className="h-8 w-8 text-violet-600" />
          </div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Espace Mutuelle
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Accès réservé aux partenaires mutuelle et assurances
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-card shadow-e2b-soft h-64 animate-pulse rounded-2xl border" />
          }
        >
          <LoginForm redirectTo="/mutuelle" />
        </Suspense>

        {/* Links */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link
            href="/login/select"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la sélection
          </Link>
          <p className="text-muted-foreground text-xs">
            En cas de problème, contactez{" "}
            <a
              href="mailto:support@easy2book.tn"
              className="text-primary hover:underline"
            >
              le support mutuelle
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
