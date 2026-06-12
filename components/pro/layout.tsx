"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  BedDouble,
  Calendar,
  Users,
  Building2,
  Percent,
  Receipt,
  ScrollText,
  FileText,
  KeyRound,
  LogOut,
  ChevronDown,
  Wallet,
  RefreshCw,
  PanelLeft,
  Car,
  Activity,
  PackageOpen,
  Moon,
  Sun,
} from "lucide-react"
import { useTheme } from "next-themes"

import { Easy2BookLogo } from "@/components/easy2book-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Types publics                                                                */
/* -------------------------------------------------------------------------- */

export type ProSidebarRole = "partner_owner" | "partner_agent" | "super_admin"

export type ProSidebarUser = {
  displayName: string
  email: string
  initials: string
  role: ProSidebarRole
  isAdminPreview: boolean
}

export type ProSidebarAgency = {
  name: string
  brandName: string | null
  depositBalance: string
  creditLowThreshold: string
  maskCredit: boolean
}

/* -------------------------------------------------------------------------- */
/* Constantes de navigation                                                     */
/* -------------------------------------------------------------------------- */

type NavItem = {
  title: string
  icon: React.ElementType
  href: string
  badge?: string
  subItems?: { title: string; href: string; icon: React.ElementType }[]
}

const BOOKING_NAV: NavItem[] = [
  {
    title: "Tableau de bord",
    icon: LayoutDashboard,
    href: "/pro",
  },
  {
    title: "Hôtels",
    icon: BedDouble,
    href: "/pro/hotels",
  },
  {
    title: "Transferts",
    icon: Car,
    href: "/pro/transfers",
  },
  {
    title: "Omra",
    icon: Moon,
    href: "/pro/omra",
  },
  {
    title: "Activités",
    icon: Activity,
    href: "/pro/activities",
    badge: "Bientôt",
  },
  {
    title: "Formules",
    icon: PackageOpen,
    href: "/pro/packages",
    badge: "Bientôt",
  },
]

const ACCOUNT_NAV: NavItem[] = [
  {
    title: "Réservations",
    icon: Calendar,
    href: "/pro/reservations",
  },
  {
    title: "Clients",
    icon: Users,
    href: "/pro/clients",
  },
  {
    title: "Paiements",
    icon: Receipt,
    href: "/pro/paiements",
  },
  {
    title: "Relevé de compte",
    icon: ScrollText,
    href: "/pro/releve-compte",
  },
  {
    title: "Factures",
    icon: FileText,
    href: "/pro/factures",
  },
]

const SETTINGS_NAV: NavItem[] = [
  {
    title: "Établissement",
    icon: Building2,
    href: "/pro/etablissement",
  },
  {
    title: "Marges",
    icon: Percent,
    href: "/pro/marges",
  },
  {
    title: "Utilisateurs",
    icon: Users,
    href: "/pro/utilisateurs",
  },
  {
    title: "Mot de passe",
    icon: KeyRound,
    href: "/pro/change-password",
  },
]

/* -------------------------------------------------------------------------- */
/* Breadcrumb labels                                                            */
/* -------------------------------------------------------------------------- */

const PATH_LABELS: Record<string, string> = {
  pro: "Pro",
  hotels: "Hôtels",
  reservations: "Réservations",
  clients: "Clients",
  paiements: "Paiements",
  "releve-compte": "Relevé de compte",
  factures: "Factures",
  etablissement: "Établissement",
  marges: "Marges",
  utilisateurs: "Utilisateurs",
  "change-password": "Mot de passe",
  booking: "Réservation",
  travelers: "Voyageurs",
  confirmation: "Confirmation",
  transfers: "Transferts",
  omra: "Omra",
  activities: "Activités",
  packages: "Formules",
}

function buildBreadcrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  return parts.map((part, i) => ({
    label: PATH_LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1),
    href: "/" + parts.slice(0, i + 1).join("/"),
  }))
}

/* -------------------------------------------------------------------------- */
/* Wallet balance widget                                                        */
/* -------------------------------------------------------------------------- */

function WalletBadge({
  balance,
  threshold,
  onRefresh,
}: {
  balance: string
  threshold: string
  onRefresh: () => void
}) {
  const num = parseFloat(balance)
  const thr = parseFloat(threshold)
  const isLow = Number.isFinite(num) && Number.isFinite(thr) && num < thr
  const formatted = Number.isFinite(num)
    ? num.toLocaleString("fr-FR", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })
    : "—"

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        isLow
          ? "border-destructive/30 bg-destructive/5"
          : "border-border/50 bg-muted/50",
      )}
    >
      <Wallet
        className={cn("h-4 w-4 shrink-0", isLow ? "text-destructive" : "text-primary")}
      />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Mon Crédit
        </p>
        <p
          className={cn(
            "text-sm font-bold tabular-nums",
            isLow ? "text-destructive" : "text-foreground",
          )}
        >
          {formatted} DT
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Rafraîchir le solde"
        className="text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Nav group                                                                    */
/* -------------------------------------------------------------------------- */

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              item.href === "/pro"
                ? pathname === "/pro"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/")

            if (item.subItems) {
              return (
                <Collapsible
                  key={item.title}
                  defaultOpen={isActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={isActive}>
                        <item.icon className="size-4" />
                        <span className="flex-1">{item.title}</span>
                        <ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.subItems.map((sub) => (
                          <SidebarMenuSubItem key={sub.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === sub.href}
                            >
                              <Link href={sub.href}>
                                <sub.icon className="size-3" />
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            }

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={item.href} className="flex items-center gap-2">
                    <item.icon className="size-4" />
                    <span className="flex-1">{item.title}</span>
                    {item.badge ? (
                      <Badge
                        variant="secondary"
                        className="ml-auto h-4 px-1.5 text-[10px]"
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/* -------------------------------------------------------------------------- */
/* ProShell — composant principal                                               */
/* -------------------------------------------------------------------------- */

export function ProShell({
  user,
  agency,
  children,
}: {
  user: ProSidebarUser
  agency: ProSidebarAgency
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const breadcrumbs = buildBreadcrumbs(pathname)

  function handleRefreshBalance() {
    router.refresh()
  }

  async function handleLogout() {
    const res = await fetch("/api/auth/signout", { method: "POST" })
    if (res.ok) router.replace("/pro/login")
  }

  const agencyLabel = agency.brandName ?? agency.name

  return (
    <SidebarProvider>
      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <Sidebar className="border-sidebar-border border-r">
        {/* Logo */}
        <SidebarHeader className="border-sidebar-border/60 border-b px-4 py-4">
          <Link
            href="/pro"
            className="flex items-center gap-3"
            aria-label="Easy2Book Pro"
          >
            <Easy2BookLogo className="e2b-logo-pulse size-9" />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight">
                <span className="text-sidebar-foreground">Easy</span>
                <span className="text-sidebar-primary">2</span>
                <span className="text-sidebar-foreground">Book</span>
              </span>
              <span className="text-sidebar-foreground/60 text-[10px] font-medium uppercase tracking-wider">
                Espace Pro
              </span>
            </div>
          </Link>

          {/* Agence */}
          <div className="mt-2 flex items-center gap-2 rounded-lg px-1 py-1">
            <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
              <span className="text-primary text-xs font-bold">
                {agencyLabel.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sidebar-foreground truncate text-xs font-semibold">
                {agencyLabel}
              </p>
              {user.isAdminPreview && (
                <Badge
                  variant="outline"
                  className="mt-0.5 h-4 border-amber-400 px-1 text-[9px] text-amber-600"
                >
                  Vue simulée
                </Badge>
              )}
            </div>
          </div>
        </SidebarHeader>

        {/* Navigation */}
        <SidebarContent className="gap-0">
          <NavGroup label="Recherche & Réservation" items={BOOKING_NAV} pathname={pathname} />
          <NavGroup label="Mon Compte" items={ACCOUNT_NAV} pathname={pathname} />
          <NavGroup label="Paramètres" items={SETTINGS_NAV} pathname={pathname} />
        </SidebarContent>

        {/* Footer — wallet + user */}
        <SidebarFooter className="border-sidebar-border/60 gap-3 border-t p-3">
          {!agency.maskCredit && (
            <WalletBadge
              balance={agency.depositBalance}
              threshold={agency.creditLowThreshold}
              onRefresh={handleRefreshBalance}
            />
          )}

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="h-auto py-2.5">
                <Avatar className="border-sidebar-primary/30 size-8 border">
                  <AvatarFallback className="bg-sidebar-primary/10 text-sidebar-primary text-xs font-bold">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col items-start">
                  <span className="text-sidebar-foreground truncate text-xs font-semibold">
                    {user.displayName}
                  </span>
                  <span className="text-sidebar-foreground/60 truncate text-[10px]">
                    {user.email}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Toggle thème */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                {theme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
                <span>{theme === "dark" ? "Mode clair" : "Mode sombre"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Déconnexion */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => void handleLogout()}
                className="text-destructive/80 hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-4" />
                <span>Se déconnecter</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ------------------------------------------------------------------ */}
      {/* Contenu principal                                                   */}
      {/* ------------------------------------------------------------------ */}
      <SidebarInset>
        {/* Header sticky avec breadcrumb */}
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
          <SidebarTrigger aria-label="Basculer la barre latérale">
            <PanelLeft className="size-5" />
          </SidebarTrigger>
          <Separator orientation="vertical" className="h-5" />

          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <Fragment key={crumb.href}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {index === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.href}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>

          {/* Wallet compact en header (mobile) */}
          {!agency.maskCredit && (
            <div className="ml-auto flex items-center gap-1 md:hidden">
              <Wallet className="text-primary h-4 w-4" />
              <span
                className={cn(
                  "text-xs font-bold tabular-nums",
                  parseFloat(agency.depositBalance) <
                    parseFloat(agency.creditLowThreshold)
                    ? "text-destructive"
                    : "text-foreground",
                )}
              >
                {parseFloat(agency.depositBalance).toLocaleString("fr-FR", {
                  minimumFractionDigits: 3,
                })}{" "}
                DT
              </span>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="bg-muted/20 flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
