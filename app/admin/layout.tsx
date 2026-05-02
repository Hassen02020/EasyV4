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
} from "lucide-react"
import { TunisiaGoLogo } from "@/components/tunisia-go-logo"
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

const navItems = [
  {
    title: "Tableau de bord",
    icon: LayoutDashboard,
    href: "/admin",
  },
  {
    title: "Réservations",
    icon: Calendar,
    href: "/admin/reservations",
    subItems: [
      { title: "Vols", href: "/admin/reservations/vols", icon: Plane },
      { title: "Hôtels Tunisie", href: "/admin/reservations/hotels", icon: Building2 },
      { title: "Omra", href: "/admin/reservations/omra", icon: Moon },
    ],
  },
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
  {
    title: "Support & Clients",
    icon: Headphones,
    href: "/admin/support",
  },
]

function getBreadcrumb(pathname: string) {
  const paths = pathname.split("/").filter(Boolean)
  const breadcrumbs = []
  
  for (let i = 0; i < paths.length; i++) {
    const href = "/" + paths.slice(0, i + 1).join("/")
    let label = paths[i].charAt(0).toUpperCase() + paths[i].slice(1)
    
    // Custom labels
    if (paths[i] === "admin") label = "Admin"
    if (paths[i] === "reservations") label = "Réservations"
    if (paths[i] === "config") label = "Configuration XML"
    if (paths[i] === "inventory") label = "Inventaire"
    if (paths[i] === "support") label = "Support"
    if (paths[i] === "vols") label = "Vols"
    if (paths[i] === "hotels") label = "Hôtels Tunisie"
    if (paths[i] === "omra") label = "Omra"
    
    breadcrumbs.push({ label, href })
  }
  
  return breadcrumbs
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumb(pathname)

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-border">
        <SidebarHeader className="border-b border-border px-4 py-4">
          <Link href="/admin" className="flex items-center gap-3">
            <TunisiaGoLogo className="size-10" />
            <div className="flex flex-col">
              <span className="text-lg font-bold">
                <span className="text-[#1e3a5f]">Tunisia</span>
                <span className="text-[#e5b94e]">Go</span>
              </span>
              <span className="text-xs text-muted-foreground">Backoffice</span>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  
                  if (item.subItems) {
                    return (
                      <Collapsible key={item.title} defaultOpen={isActive} className="group/collapsible">
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

        <SidebarFooter className="border-t border-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="h-auto py-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-[#1e3a5f] text-white text-xs">
                    AD
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">Admin</span>
                  <span className="text-xs text-muted-foreground">admin@tunisiago.tn</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/" className="text-muted-foreground hover:text-destructive">
                  <LogOut className="size-4" />
                  <span>Déconnexion</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
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
                      <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
