/**
 * Logs Système — Super Admin uniquement
 *
 * Visualisation des logs d'activité, erreurs API et audit
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  RefreshCw,
  Terminal,
  Users,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

export const metadata: Metadata = {
  title: "Logs Système — Super Admin",
  description: "Logs d'activité et monitoring système",
}

export const dynamic = "force-dynamic"

// Mock logs pour la démo
const MOCK_LOGS = [
  {
    id: "log-001",
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 min ago
    level: "info",
    category: "auth",
    message: "Connexion réussie - admin@easy2book.tn",
    user: "admin@easy2book.tn",
    ip: "192.168.1.100",
  },
  {
    id: "log-002",
    timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 min ago
    level: "warning",
    category: "api",
    message: "API MyGo - Timeout sur /hotels/search (2.5s)",
    user: "system",
    ip: "—",
  },
  {
    id: "log-003",
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
    level: "error",
    category: "payment",
    message: "Échec paiement SPS - Réservation #E2B-2024-1234",
    user: "client@example.com",
    ip: "41.226.XX.XX",
  },
  {
    id: "log-004",
    timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 min ago
    level: "info",
    category: "booking",
    message: "Réservation confirmée - #E2B-2024-1235",
    user: "agent@agence.tn",
    ip: "197.14.XX.XX",
  },
  {
    id: "log-005",
    timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1h ago
    level: "info",
    category: "user",
    message: "Nouvel utilisateur créé - partner@agence2.tn",
    user: "super_admin@easy2book.tn",
    ip: "192.168.1.100",
  },
]

const LEVEL_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  info: {
    label: "Info",
    color: "bg-blue-100 text-blue-800",
    icon: CheckCircle2,
  },
  warning: {
    label: "Avertissement",
    color: "bg-amber-100 text-amber-800",
    icon: AlertTriangle,
  },
  error: {
    label: "Erreur",
    color: "bg-red-100 text-red-800",
    icon: AlertTriangle,
  },
  debug: { label: "Debug", color: "bg-gray-100 text-gray-800", icon: Terminal },
}

const CATEGORY_CONFIG: Record<string, { label: string }> = {
  auth: { label: "Authentification" },
  api: { label: "API" },
  payment: { label: "Paiement" },
  booking: { label: "Réservation" },
  user: { label: "Utilisateur" },
  system: { label: "Système" },
}

export default async function SystemLogsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/logs")
  }

  const profile = await getCurrentAdminProfile(user.id)

  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  const stats = {
    total: MOCK_LOGS.length,
    errors: MOCK_LOGS.filter((l) => l.level === "error").length,
    warnings: MOCK_LOGS.filter((l) => l.level === "warning").length,
    info: MOCK_LOGS.filter((l) => l.level === "info").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Logs Système
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitoring des activités et erreurs système
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filtrer
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <FileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-muted-foreground text-xs">Dernières 24h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Erreurs</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Avertissements
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {stats.warnings}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Info</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.info}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="payment">Paiement</TabsTrigger>
          <TabsTrigger value="booking">Réservations</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Tous les logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LogsTable logs={MOCK_LOGS} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs Authentification</CardTitle>
            </CardHeader>
            <CardContent>
              <LogsTable
                logs={MOCK_LOGS.filter((l) => l.category === "auth")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs API</CardTitle>
            </CardHeader>
            <CardContent>
              <LogsTable logs={MOCK_LOGS.filter((l) => l.category === "api")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LogsTable({ logs }: { logs: typeof MOCK_LOGS }) {
  if (logs.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-300" />
        <p className="text-muted-foreground mt-4">Aucun log trouvé</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Niveau</TableHead>
            <TableHead className="w-32">Catégorie</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Utilisateur</TableHead>
            <TableHead>IP</TableHead>
            <TableHead className="w-32">Heure</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const levelConfig = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info
            const categoryConfig = CATEGORY_CONFIG[log.category] || {
              label: log.category,
            }
            const LevelIcon = levelConfig.icon

            return (
              <TableRow key={log.id}>
                <TableCell>
                  <Badge className={levelConfig.color}>
                    <LevelIcon className="mr-1 h-3 w-3" />
                    {levelConfig.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {categoryConfig.label}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{log.message}</p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-gray-400" />
                    <span className="text-muted-foreground text-sm">
                      {log.user}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                    {log.ip}
                  </code>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-muted-foreground text-xs">
                      {log.timestamp.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
