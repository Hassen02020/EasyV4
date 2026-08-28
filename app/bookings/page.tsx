"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Search, Loader2, AlertCircle, ArrowLeft, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { lookupBooking, type BookingSummary } from "@/app/actions/lookup-booking"
import { BookingCard } from "@/components/booking-summary-card"
import { useT } from "@/components/locale-context"

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const t = useT()
  const [ref, setRef] = useState("")
  const [email, setEmail] = useState("")
  const [result, setResult] = useState<BookingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)

    startTransition(async () => {
      const res = await lookupBooking(ref, email)
      if (res.ok) {
        setResult(res.booking)
      } else {
        setError(res.error)
      }
    })
  }

  function handleReset() {
    setRef("")
    setEmail("")
    setResult(null)
    setError(null)
  }

  return (
    <div className="from-background via-background to-accent/5 min-h-screen bg-gradient-to-br">
      {/* Top bar */}
      <div className="border-border border-b bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Easy2BookLogo
              withWordmark={false}
              className="size-9 bg-gray-100"
              priority
            />
            <span className="text-base font-bold">
              <span className="text-sidebar">Easy</span>
              <span className="text-accent">2</span>
              <span className="text-sidebar">Book</span>
            </span>
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("accueil")}
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-foreground text-3xl font-bold">
            {t("mesReservations")}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("consultezStatut")}
          </p>
        </div>

        {/* Search form */}
        {!result && (
          <form
            onSubmit={handleSubmit}
            className="bg-card border-border space-y-4 rounded-2xl border p-6 shadow-sm"
          >
            <div className="space-y-2">
              <Label htmlFor="ref">{t("codeReservation")}</Label>
              <Input
                id="ref"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                placeholder="ex: E2B-2026-XXXXXX"
                className="font-mono tracking-widest uppercase"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("adresseEmail")}</Label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemple.com"
                  className="pl-9"
                  required
                  disabled={isPending}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full gap-2" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />{" "}
                  {t("rechercheEnCours")}
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" /> {t("rechercherReservation")}
                </>
              )}
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              Vous avez déjà un compte ?{" "}
              <Link href="/compte" className="text-primary font-medium hover:underline">
                Connectez-vous
              </Link>{" "}
              pour voir toutes vos réservations d&apos;un coup.
            </p>
          </form>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <BookingCard booking={result} />
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="gap-2"
              >
                <Search className="h-4 w-4" />
                {t("autreReservation")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
