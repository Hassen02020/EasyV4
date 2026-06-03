"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Calendar,
  Settings,
  Database,
  Headphones,
  LogOut,
  ChevronDown,
  Building2,
  Moon,
  Plane,
  Users,
  Shield,
  Activity,
  Building,
  ShoppingBag,
  CreditCard,
  Briefcase,
  UserCog,
  DollarSign,
  FileText,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export type AdminShellRole =
  | "super_admin"
  | "manager"
  | "agent_resa"
  | "agent_compta"
  | "agent_excursions"

export type AdminShellUser = {
  email: string
  displayName: string
  initials: string
  role: AdminShellRole
}

const ROLE_LABEL: Record<AdminShellRole, string> = {
  super_admin: "Super admin",
  manager: "Manager",
  agent_resa: "Agent réservation",
  agent_compta: "Agent compta",
  agent_excursions: "Agent excursions",
}

type NavItem = {
  title: string
  icon: React.ElementType
  href: string
  subItems?: { title: string; href: string; icon: React.ElementType }[]
}

const baseNavItems: NavItem[] = [
  {
    title: "Tableau de bord",
    icon: LayoutDashboard,
    href: "/admin",
  },
]

const managerNavItems: NavItem[] = [
  {
    title: "B2C — Réservations",
    icon: ShoppingBag,
    href: "/admin/b2c/reservations",
    subItems: [
      { title: "Toutes les réservations", href: "/admin/b2c/reservations", icon: Calendar },
      { title: "En attente", href: "/admin/b2c/reservations?status=pending", icon: Clock },
      { title: "Confirmées", href: "/admin/b2c/reservations?status=confirmed", icon: CheckCircle2 },
      { title: "Annulations", href: "/admin/b2c/reservations?status=cancelled", icon: XCircle },
    ],
  },
  {
    title: "B2C — Clients",
    icon: Users,
    href: "/admin/b2c/clients",
  },
  {
    title: "Produits & Catalogue",
    icon: Package,
    href: "/admin/products",
    subItems: [
      { title: "Hôtels", href: "/admin/products/hotels", icon: Building2 },
      { title: "Vols", href: "/admin/products/flights", icon: Plane },
      { title: "Voyages Organisés", href: "/admin/products/packages", icon: Briefcase },
      { title: "Omra", href: "/admin/products/omra", icon: Moon },
      { title: "Activités", href: "/admin/products/activities", icon: Activity },
    ],
  },
  {
    title: "Comptabilité",
    icon: DollarSign,
    href: "/admin/accounting",
    subItems: [
      { title: "Tableau de bord", href: "/admin/accounting", icon: LayoutDashboard },
      { title: "Paiements", href: "/admin/accounting/payments", icon: CreditCard },
      { title: "Factures", href: "/admin/accounting/invoices", icon: FileText },
      { title: "Rapports", href: "/admin/accounting/reports", icon: Activity },
    ],
  },
  {
    title: "Personnel",
    icon: UserCog,
    href: "/admin/staff",
  },
  {
    title: "Support & Clients",
    icon: Headphones,
    href: "/admin/support",
  },
]

const technicalNavItems: NavItem[] = [
  {
    title: "Configuration XML",
    icon: Settings,
    href: "/admin/config",
  },
  {
    title: "Inventaire Statique",
    icon: Database,
    href: "/admin/inventory",
  },
]

const superAdminNavItems: NavItem[] = [
  {
    title: "Administration Système",
    icon: Shield,
    href: "/admin/users",
    subItems: [
      { title: "Utilisateurs", href: "/admin/users", icon: Users },
      { title: "Agences", href: "/admin/agencies", icon: Building },
      { title: "Logs Système", href: "/admin/logs", icon: Activity },
    ],
  },
]

function getNavItems(role: AdminShellRole): NavItem[] {
  switch (role) {
    case "super_admin":
      return [...baseNavItems, ...managerNavItems, ...technicalNavItems, ...superAdminNavItems]
    case "manager":
      return [...baseNavItems, ...managerNavItems, ...technicalNavItems]
    case "agent_resa":
      // Agent résa : accès limité aux réservations, produits (lecture), et support
      return [
        ...baseNavItems,
        managerNavItems[0]!, // B2C Réservations (avec subItems)
        managerNavItems[2]!, // Produits (lecture seule)
        managerNavItems[5]!, // Support & Clients
      ]
    case "agent_compta":
      // Agent compta : accès comptabilité + réservations (lecture)
      return [
        ...baseNavItems,
        managerNavItems[0]!, // B2C Réservations
        managerNavItems[3]!, // Comptabilité (avec subItems)
      ]
    default:
      return [...baseNavItems, ...technicalNavItems]
  }
}

function getBreadcrumb(pathname: string) {
  const paths = pathname.split("/").filter(Boolean)
  const breadcrumbs: { label: string; href: string }[] = []

  for (let i = 0; i < paths.length; i++) {
    const href = "/" + paths.slice(0, i + 1).join("/")
    let label = paths[i].charAt(0).toUpperCase() + paths[i].slice(1)

    if (paths[i] === "admin") label = "Admin"
    if (paths[i] === "reservations") label = "Réservations"
    if (paths[i] === "config") label = "Configuration XML"
    if (paths[i] === "inventory") label = "Inventaire"
    if (paths[i] === "support") label = "Support"
    if (paths[i] === "vols") label = "Vols"
    if (paths[i] === "hotels") label = "Hôtels Tunisie"
    if (paths[i] === "omra") label = "Omra"
    if (paths[i] === "b2c") label = "B2C"
    if (paths[i] === "clients") label = "Clients"
    if (paths[i] === "products") label = "Produits"
    if (paths[i] === "accounting") label = "Comptabilité"
    if (paths[i] === "staff") label = "Personnel"
    if (paths[i] === "users") label = "Utilisateurs"
    if (paths[i] === "agencies") label = "Agences"
    if (paths[i] === "logs") label = "Logs Système"

    breadcrumbs.push({ label, href })
  }

  return breadcrumbs
}

export function AdminShell({
  user,
  children,
}: {
  user: AdminShellUser
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumb(pathname)
  const navItems = getNavItems(user.role)

  return (
    <SidebarProvider>
      <Sidebar className="border-sidebar-border border-r">
        <SidebarHeader className="border-sidebar-border/60 border-b px-4 py-5">
          <Link
            href="/admin"
            className="flex items-center gap-3"
            aria-label="Easy2Book Backoffice"
          >
            <Easy2BookLogo className="e2b-logo-pulse size-10" />
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight">
                <span className="text-sidebar-foreground">Easy</span>
                <span className="text-sidebar-primary">2</span>
                <span className="text-sidebar-foreground">Book</span>
              </span>
              <span className="text-sidebar-foreground/70 text-xs">
                Backoffice
              </span>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
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
                              <span>{item.title}</span>
                              <ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.subItems.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={pathname === subItem.href}
                                  >
                                    <Link href={subItem.href}>
                                      <subItem.icon className="size-3" />
                                      <span>{subItem.title}</span>
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
                        <Link href={item.href}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-sidebar-border/60 border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="h-auto py-3">
                <Avatar className="border-sidebar-primary/40 size-8 border">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start">
                  <span className="text-sidebar-foreground text-sm font-medium">
                    {user.displayName}
                  </span>
                  <span className="text-sidebar-foreground/70 text-xs">
                    {ROLE_LABEL[user.role]} · {user.email}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <form action="/api/auth/signout" method="post" className="w-full">
                <SidebarMenuButton
                  asChild
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                >
                  <button type="submit">
                    <LogOut className="size-4" />
                    <span>Déconnexion</span>
                  </button>
                </SidebarMenuButton>
              </form>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-4 border-b px-6 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
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
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="bg-muted/30 flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
