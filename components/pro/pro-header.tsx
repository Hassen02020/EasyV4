"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  RefreshCw,
  Sun,
  Moon,
  Languages,
  CircleDollarSign,
  Wallet,
  Users,
  Building2,
  Percent,
  KeyRound,
  LogOut,
  Calendar,
  FileText,
  Receipt,
  ScrollText,
  UserCircle,
} from "lucide-react"
import { useTheme } from "next-themes"

import { Easy2BookLogo } from "@/components/easy2book-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const LANGUAGES = [
  { code: "ar", label: "Arabe", flag: "🇹🇳" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "tr", label: "Turc", flag: "🇹🇷" },
] as const

const CURRENCIES = [
  { code: "TND", symbol: "DT", label: "Dinars Tunisie" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "USD", symbol: "$", label: "Dolars" },
  { code: "DZD", symbol: "DA", label: "Dinar algérien" },
] as const

export type ProHeaderUser = {
  displayName: string
  email: string
  initials: string
  role: "partner_owner" | "partner_agent" | "super_admin"
  isAdminPreview: boolean
}

export type ProHeaderAgency = {
  name: string
  brandName: string | null
  logoUrl: string | null
  defaultLanguage: string
  defaultCurrency: string
  maskCredit: boolean
  depositBalance: string
  creditLowThreshold: string
}

interface ProHeaderProps {
  user: ProHeaderUser
  agency: ProHeaderAgency
}

const ROLE_LABEL: Record<ProHeaderUser["role"], string> = {
  partner_owner: "owner",
  partner_agent: "agent",
  super_admin: "admin",
}

function formatCreditBalance(value: string, locale = "fr-FR"): string {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) return "0,000 DT"
  return `${num.toLocaleString(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

export function ProHeader({ user, agency }: ProHeaderProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [pending, startTransition] = useTransition()
  const [currentLang, setCurrentLang] = useState(agency.defaultLanguage)
  const [currentCurrency, setCurrentCurrency] = useState(agency.defaultCurrency)
  const [isRefreshingCredit, setIsRefreshingCredit] = useState(false)

  const isCreditLow =
    Number.parseFloat(agency.depositBalance) <
    Number.parseFloat(agency.creditLowThreshold)

  async function handleLogout() {
    startTransition(async () => {
      const supabase = createBrowserSupabase()
      await supabase.auth.signOut()
      router.replace("/pro/login")
      router.refresh()
    })
  }

  async function refreshCredit() {
    setIsRefreshingCredit(true)
    try {
      router.refresh()
      await new Promise((r) => setTimeout(r, 400))
    } finally {
      setIsRefreshingCredit(false)
    }
  }

  const selectedLang = LANGUAGES.find((l) => l.code === currentLang)
  const selectedCurrency = CURRENCIES.find((c) => c.code === currentCurrency)

  return (
    <header className="bg-background border-border/60 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/pro"
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
          aria-label="Tableau de bord Easy2Book Pro"
        >
          <Easy2BookLogo
            className="e2b-logo-pulse h-12 w-12"
            withWordmark
            priority
          />
        </Link>

        <div className="flex items-center gap-3 sm:gap-5">
          {!agency.maskCredit ? (
            <div className="bg-muted/60 border-border/50 shadow-e2b-soft hidden items-center gap-2 rounded-2xl border px-4 py-2 md:flex">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  Mon Crédit
                </span>
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    isCreditLow ? "text-destructive" : "text-foreground",
                  )}
                >
                  {formatCreditBalance(agency.depositBalance)}
                </span>
              </div>
              <button
                type="button"
                onClick={refreshCredit}
                aria-label="Rafraîchir le solde de crédit"
                className="text-primary hover:bg-primary/10 rounded-full p-1.5 transition-colors"
                disabled={isRefreshingCredit}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    isRefreshingCredit && "animate-spin",
                  )}
                />
              </button>
            </div>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hover:bg-muted/60 flex items-center gap-3 rounded-2xl border border-transparent px-2 py-1.5 transition-colors"
              >
                <div className="hidden text-right sm:flex sm:flex-col">
                  <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                    Bonjour
                  </span>
                  <span className="text-foreground text-sm font-semibold tracking-wide uppercase">
                    {user.displayName}
                  </span>
                </div>
                <div className="relative">
                  <Avatar className="border-primary/20 h-10 w-10 border-2">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {user.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="border-background absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 bg-emerald-500"
                    aria-label="Statut en ligne"
                  />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="border-border/50 shadow-e2b-elevated w-72 rounded-2xl"
            >
              <DropdownMenuLabel className="flex items-start gap-2 pb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-semibold uppercase">
                      {user.displayName}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase dark:bg-emerald-900/40 dark:text-emerald-300">
                      {ROLE_LABEL[user.role]}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Agence:{" "}
                    <span className="text-foreground font-medium">
                      {agency.brandName ?? agency.name}
                    </span>
                  </p>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="rounded-lg">
                  <Wallet className="text-primary mr-2 h-4 w-4" />
                  <span className="flex-1">Mon Crédit</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-2xl">
                  <DropdownMenuItem asChild>
                    <Link href="/pro/reservations">
                      <Calendar className="mr-2 h-4 w-4" />
                      Mes réservations
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/pro/clients">
                      <UserCircle className="mr-2 h-4 w-4" />
                      Mes clients
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/pro/paiements">
                      <Receipt className="mr-2 h-4 w-4" />
                      Mes paiements
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/pro/releve-compte">
                      <ScrollText className="mr-2 h-4 w-4" />
                      Relevé de compte
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/pro/factures">
                      <FileText className="mr-2 h-4 w-4" />
                      Mes Factures
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="rounded-lg">
                  <Building2 className="text-primary mr-2 h-4 w-4" />
                  <span className="flex-1">Gestion de l&apos;affilié</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-2xl">
                  <DropdownMenuItem asChild>
                    <Link href="/pro/etablissement">
                      <Building2 className="mr-2 h-4 w-4" />
                      Établissement
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/pro/marges">
                      <Percent className="mr-2 h-4 w-4" />
                      Marges
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem asChild>
                <Link href="/pro/utilisateurs">
                  <Users className="text-primary mr-2 h-4 w-4" />
                  Gestion des utilisateurs
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  setTheme(theme === "dark" ? "light" : "dark")
                }}
                className="cursor-pointer rounded-lg"
              >
                <span className="mr-2 flex-1">Mode</span>
                {theme === "dark" ? (
                  <Moon className="text-secondary h-4 w-4" />
                ) : (
                  <Sun className="text-accent h-4 w-4" />
                )}
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="rounded-lg">
                  <Languages className="text-primary mr-2 h-4 w-4" />
                  <span className="flex-1">Langue</span>
                  <span className="text-muted-foreground text-xs uppercase">
                    {selectedLang?.flag} {currentLang.toUpperCase()}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-2xl">
                  {LANGUAGES.map((l) => (
                    <DropdownMenuItem
                      key={l.code}
                      onSelect={() => setCurrentLang(l.code)}
                      className={cn(
                        "cursor-pointer rounded-lg",
                        currentLang === l.code && "bg-primary/10",
                      )}
                    >
                      <span className="mr-2">{l.flag}</span>
                      {l.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="rounded-lg">
                  <CircleDollarSign className="text-primary mr-2 h-4 w-4" />
                  <span className="flex-1">Devise</span>
                  <span className="text-muted-foreground text-xs">
                    Devise ({selectedCurrency?.symbol ?? "DT"})
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-2xl">
                  {CURRENCIES.map((c) => (
                    <DropdownMenuItem
                      key={c.code}
                      onSelect={() => setCurrentCurrency(c.code)}
                      className={cn(
                        "cursor-pointer rounded-lg",
                        currentCurrency === c.code && "bg-primary/10",
                      )}
                    >
                      <span className="text-primary mr-2 font-semibold">
                        {c.symbol}
                      </span>
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/pro/change-password">
                  <KeyRound className="text-primary mr-2 h-4 w-4" />
                  Changer le mot de passe
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  void handleLogout()
                }}
                disabled={pending}
                className="text-destructive focus:text-destructive cursor-pointer rounded-lg"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {user.isAdminPreview ? (
            <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-800 uppercase lg:inline-block dark:bg-amber-900/40 dark:text-amber-300">
              Vue B2B simulée
            </span>
          ) : null}
        </div>
      </div>
    </header>
  )
}
