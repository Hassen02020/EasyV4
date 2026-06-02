"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Plane,
  Building2,
  Globe,
  Moon,
  Briefcase,
  Bus,
  Car,
  Download,
  ArrowLeft,
  CalendarDays,
  User,
  Phone,
  Mail,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { lookupBooking, type BookingSummary, type BookingStatus } from "@/app/actions/lookup-booking"

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; icon: React.ElementType; step: number }
> = {
  pending:    { label: "En attente",         color: "bg-amber-100 text-amber-800 border-amber-200",   icon: Clock,         step: 1 },
  on_request: { label: "Sur demande",        color: "bg-blue-100 text-blue-800 border-blue-200",      icon: RefreshCw,     step: 2 },
  confirmed:  { label: "Confirmée",          color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2, step: 3 },
  cancelled:  { label: "Annulée",            color: "bg-red-100 text-red-800 border-red-200",         icon: XCircle,       step: 0 },
  refunded:   { label: "Remboursée",         color: "bg-gray-100 text-gray-800 border-gray-200",      icon: RefreshCw,     step: 0 },
  no_show:    { label: "No-show",            color: "bg-red-100 text-red-700 border-red-200",         icon: XCircle,       step: 0 },
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  flight:   Plane,
  hotel:    Building2,
  hotel_world: Globe,
  omra:     Moon,
  package:  Briefcase,
  transfer: Bus,
  car:      Car,
}

const MODULE_LABELS: Record<string, string> = {
  flight:      "Vol",
  hotel:       "Hôtel Tunisie",
  hotel_world: "Hôtel International",
  omra:        "Omraty",
  package:     "Voyage Organisé",
  transfer:    "Transfert",
  car:         "Location Voiture",
}

const TIMELINE_STEPS = [
  { label: "Demande reçue",    step: 1 },
  { label: "En traitement",    step: 2 },
  { label: "Confirmée",        step: 3 },
]

// ─── Components ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BookingStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  )
}

function Timeline({ status }: { status: BookingStatus }) {
  const currentStep = STATUS_CONFIG[status]?.step ?? 0
  const isCancelled = currentStep === 0

  if (isCancelled) return null

  return (
    <div className="flex items-center gap-0">
      {TIMELINE_STEPS.map((s, i) => {
        const done = currentStep >= s.step
        const active = currentStep === s.step
        return (
          <div key={s.step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                      ? "border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f]"
                      : "border-gray-200 bg-white text-gray-400"
                }`}
              >
                {done && !active ? <CheckCircle2 className="h-4 w-4" /> : s.step}
              </div>
              <span className={`text-[10px] whitespace-nowrap font-medium ${done ? "text-emerald-600" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div className={`mb-4 h-0.5 w-12 sm:w-20 ${currentStep > s.step ? "bg-emerald-400" : "bg-gray-200"}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function BookingCard({ booking }: { booking: BookingSummary }) {
  const ModuleIcon = MODULE_ICONS[booking.module] ?? Briefcase
  const moduleLabel = MODULE_LABELS[booking.module] ?? booking.module

  function formatDate(iso: string | null) {
    if (!iso) return "—"
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "long", year: "numeric",
    })
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b bg-[#1e3a5f]/3 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e3a5f]/10">
            <ModuleIcon className="h-5 w-5 text-[#1e3a5f]" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#1e3a5f]">{moduleLabel}</p>
            <p className="text-foreground font-mono text-lg font-bold tracking-wider">
              {booking.publicRef}
            </p>
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="p-5 space-y-5">
        {/* Timeline */}
        <div className="flex justify-center">
          <Timeline status={booking.status} />
        </div>

        <Separator />

        {/* Customer info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-foreground font-medium">
              {booking.customer.firstName} {booking.customer.lastName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">{booking.customer.email}</span>
          </div>
          {booking.customer.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">{booking.customer.phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">Créée le {formatDate(booking.createdAt)}</span>
          </div>
        </div>

        <Separator />

        {/* Price + dates */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-muted-foreground text-xs">Montant</p>
            <p className="text-foreground text-xl font-bold">
              {parseFloat(booking.tndAmount).toLocaleString("fr-FR")} DT
            </p>
            {booking.originalCurrency !== "TND" && (
              <p className="text-muted-foreground text-xs">
                ({parseFloat(booking.originalAmount).toLocaleString("fr-FR")} {booking.originalCurrency})
              </p>
            )}
          </div>
          {booking.confirmedAt && (
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Confirmée le</p>
              <p className="text-foreground text-sm font-medium">{formatDate(booking.confirmedAt)}</p>
            </div>
          )}
          {booking.cancelledAt && (
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Annulée le</p>
              <p className="text-destructive text-sm font-medium">{formatDate(booking.cancelledAt)}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" className="gap-1.5" disabled>
            <Download className="h-4 w-4" />
            Voucher PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled>
            <Download className="h-4 w-4" />
            Facture PDF
          </Button>
          {(booking.status === "pending" || booking.status === "on_request") && (
            <Button variant="destructive" size="sm" className="ml-auto gap-1.5" disabled>
              <XCircle className="h-4 w-4" />
              Annuler
            </Button>
          )}
        </div>

        {(booking.status === "pending" || booking.status === "on_request") && (
          <p className="text-muted-foreground text-xs">
            * Les téléchargements et annulations seront disponibles prochainement. Contactez{" "}
            <a href="tel:+21698140514" className="text-primary hover:underline">+216 98 140 514</a>{" "}
            pour toute assistance immédiate.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingsPage() {
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
            <Easy2BookLogo className="h-8 w-8" priority />
            <span className="text-foreground text-sm font-semibold">Easy2Book</span>
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Accueil
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-foreground text-3xl font-bold">Mes Réservations</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Consultez le statut de votre réservation avec votre code et votre email
          </p>
        </div>

        {/* Search form */}
        {!result && (
          <form
            onSubmit={handleSubmit}
            className="bg-card border-border shadow-sm space-y-4 rounded-2xl border p-6"
          >
            <div className="space-y-2">
              <Label htmlFor="ref">Code de réservation</Label>
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
              <Label htmlFor="email">Adresse email</Label>
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
                <><Loader2 className="h-4 w-4 animate-spin" /> Recherche en cours…</>
              ) : (
                <><Search className="h-4 w-4" /> Rechercher ma réservation</>
              )}
            </Button>
          </form>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <BookingCard booking={result} />
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
                <Search className="h-4 w-4" />
                Rechercher une autre réservation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
