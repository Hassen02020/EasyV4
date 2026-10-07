import Link from "next/link"

export const metadata = {
  title: "Easy2Book — Frontend Visual Hub",
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "EXISTS" | "MISSING"

interface RouteEntry {
  name: string
  description: string
  status: Status
  route: string
  locales?: boolean
  note?: string
}

interface Section {
  id: string
  label: string
  color: string
  routes: RouteEntry[]
}

// ---------------------------------------------------------------------------
// Route map — audit 2026-10-04
// ---------------------------------------------------------------------------

const SECTIONS: Section[] = [
  {
    id: "public",
    label: "PUBLIC",
    color:
      "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    routes: [
      {
        name: "Home",
        description: "Page d'accueil publique",
        status: "EXISTS",
        route: "/fr",
        locales: true,
      },
      {
        name: "Hotels Tunisie",
        description: "Catalogue hôtels locaux",
        status: "EXISTS",
        route: "/fr/hotels",
        locales: true,
      },
      {
        name: "Hotels Monde",
        description: "Catalogue hôtels international (RateHawk)",
        status: "EXISTS",
        route: "/fr/hotels-monde",
        locales: true,
      },
      {
        name: "Hotel Detail",
        description: "Fiche détail hôtel (nécessite un ID)",
        status: "EXISTS",
        route: "/fr/hotels/search",
        locales: true,
        note: "/fr/hotels/[id] — ouvrir depuis la liste",
      },
      {
        name: "Flights",
        description: "Recherche de vols",
        status: "EXISTS",
        route: "/fr/vols",
        locales: true,
      },
      {
        name: "Cars",
        description: "Location de voitures",
        status: "EXISTS",
        route: "/fr/car",
        locales: true,
      },
      {
        name: "Transfers",
        description: "Transferts aéroport",
        status: "EXISTS",
        route: "/fr/transferts",
        locales: true,
      },
      {
        name: "Activities",
        description: "Activités & attractions",
        status: "EXISTS",
        route: "/fr/attractions",
        locales: true,
      },
      {
        name: "Omra",
        description: "Catalogue séjours Omra",
        status: "EXISTS",
        route: "/fr/omra",
        locales: true,
      },
      {
        name: "Packages",
        description: "Voyages packagés",
        status: "EXISTS",
        route: "/fr/packages",
        locales: true,
      },
    ],
  },
  {
    id: "business",
    label: "BUSINESS",
    color:
      "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    routes: [
      {
        name: "B2B Dashboard",
        description: "Tableau de bord agence partenaire",
        status: "EXISTS",
        route: "/b2b",
      },
      {
        name: "Wallet",
        description: "Portefeuille crédit agence + recharge",
        status: "EXISTS",
        route: "/b2b/wallet",
      },
      {
        name: "CRM",
        description: "Gestion des leads et demandes",
        status: "EXISTS",
        route: "/admin/support",
      },
      {
        name: "Partner",
        description:
          "Portail B2B partenaire (dashboard, réservations, factures, wallet, clients)",
        status: "EXISTS",
        route: "/pro",
        note: "Portail complet à /pro (getCurrentPartnerProfile). /admin/accords-commerciaux = gestion super_admin des accords, distinct.",
      },
      {
        name: "Distribution",
        description: "Réseau fournisseurs & distribution",
        status: "EXISTS",
        route: "/admin/suppliers/network",
      },
      {
        name: "White Label",
        description:
          "Branding & white-label (brandName, logoUrl, primaryColor, customDomain)",
        status: "EXISTS",
        route: "/admin/agencies/[id]",
        note: "Config partielle dans la page agence (brandName sur agencies). Formulaire WL complet (logo, couleur, domaine) prévu Phase 13.",
      },
    ],
  },
  {
    id: "booking",
    label: "BOOKING",
    color:
      "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800",
    routes: [
      {
        name: "Search",
        description: "Tunnel réservation — sélection produit",
        status: "EXISTS",
        route: "/fr/booking",
        locales: true,
      },
      {
        name: "Product Detail",
        description: "Fiche produit (hôtel, omra, package…)",
        status: "EXISTS",
        route: "/fr/hotels",
        locales: true,
        note: "Plusieurs types — ouvrir depuis la liste",
      },
      {
        name: "Checkout",
        description: "Récapitulatif & paiement",
        status: "EXISTS",
        route: "/fr/booking/checkout",
        locales: true,
        note: "Nécessite un panier actif",
      },
      {
        name: "Travelers",
        description: "Saisie des voyageurs",
        status: "EXISTS",
        route: "/fr/booking/travelers",
        locales: true,
      },
      {
        name: "Confirmation",
        description: "Confirmation de réservation",
        status: "EXISTS",
        route: "/fr/booking/confirmation/[ref]",
        locales: true,
        note: "Nécessite une réf. de réservation valide",
      },
      {
        name: "Voucher",
        description: "Bon de voyage PDF — page URL partageable",
        status: "EXISTS",
        route: "/fr/voucher/[ref]",
        locales: true,
        note: "/fr/voucher/[ref]?token=[t] — nécessite ref + guestAccessToken",
      },
      {
        name: "My Bookings",
        description: "Liste des réservations client connecté",
        status: "EXISTS",
        route: "/fr/bookings",
        locales: true,
      },
    ],
  },
  {
    id: "system",
    label: "SYSTEM",
    color:
      "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    routes: [
      {
        name: "Login B2C",
        description: "Connexion espace client public",
        status: "EXISTS",
        route: "/fr/compte/connexion",
        locales: true,
      },
      {
        name: "Login B2B / Pro",
        description: "Connexion espace agence partenaire",
        status: "EXISTS",
        route: "/pro/login",
      },
      {
        name: "Login Admin",
        description: "Connexion espace administration",
        status: "EXISTS",
        route: "/login",
      },
      {
        name: "Login Mutuelle",
        description: "Connexion espace mutuelle",
        status: "EXISTS",
        route: "/mutuelle/login",
      },
      {
        name: "Register",
        description: "Création de compte client",
        status: "EXISTS",
        route: "/[locale]/compte/inscription",
        locales: true,
      },
      {
        name: "Support / CRM",
        description: "Interface admin gestion des leads",
        status: "EXISTS",
        route: "/admin/support",
      },
      {
        name: "Customer 360",
        description: "Fiche client complète (admin)",
        status: "EXISTS",
        route: "/admin/b2c/clients",
        note: "/admin/b2c/clients/[id] — ouvrir depuis la liste",
      },
      {
        name: "Account",
        description: "Espace client (compte, réservations)",
        status: "EXISTS",
        route: "/fr/compte",
        locales: true,
      },
      {
        name: "Pro Sandbox",
        description: "Bac à sable tests intégration",
        status: "EXISTS",
        route: "/pro/sandbox",
      },
    ],
  },
  {
    id: "admin",
    label: "ADMIN",
    color:
      "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
    routes: [
      {
        name: "Admin Home",
        description: "Tableau de bord admin",
        status: "EXISTS",
        route: "/admin",
      },
      {
        name: "Agencies",
        description: "Gestion des agences",
        status: "EXISTS",
        route: "/admin/agencies",
      },
      {
        name: "Reservations",
        description: "Toutes réservations",
        status: "EXISTS",
        route: "/admin/reservations",
      },
      {
        name: "Reservations Hotels",
        description: "Réservations hôtels",
        status: "EXISTS",
        route: "/admin/reservations/hotels",
      },
      {
        name: "Reservations Vols",
        description: "Réservations vols",
        status: "EXISTS",
        route: "/admin/reservations/vols",
      },
      {
        name: "Finance",
        description: "Finance & paiements",
        status: "EXISTS",
        route: "/admin/finance",
      },
      {
        name: "Accounting",
        description: "Comptabilité & rapports",
        status: "EXISTS",
        route: "/admin/accounting",
      },
      {
        name: "Products",
        description: "Catalogue produits",
        status: "EXISTS",
        route: "/admin/products",
      },
      {
        name: "Suppliers",
        description: "Fournisseurs",
        status: "EXISTS",
        route: "/admin/suppliers",
      },
      {
        name: "Staff",
        description: "Équipe interne",
        status: "EXISTS",
        route: "/admin/staff",
      },
      {
        name: "Marges",
        description: "Politique de marges",
        status: "EXISTS",
        route: "/admin/marges",
      },
      {
        name: "FX Policy",
        description: "Taux de change",
        status: "EXISTS",
        route: "/admin/fx-policy",
      },
      {
        name: "Mutuelle Admin",
        description: "Gestion dossiers mutuelle",
        status: "EXISTS",
        route: "/admin/mutuelle",
      },
      {
        name: "Journeys",
        description: "Voyages organisés",
        status: "EXISTS",
        route: "/admin/journeys",
      },
      {
        name: "Analytics Margins",
        description: "Analyse des marges",
        status: "EXISTS",
        route: "/admin/analytics/margins",
      },
      {
        name: "Analytics Niches",
        description:
          "Segments marché × produit × intention × destination × période (NICHE-UI-01)",
        status: "EXISTS",
        route: "/admin/analytics/niches",
      },
      {
        name: "Veille",
        description: "Veille tarifaire destinations",
        status: "EXISTS",
        route: "/admin/veille/projets",
      },
      {
        name: "Logs",
        description: "Journaux système",
        status: "EXISTS",
        route: "/admin/logs",
      },
    ],
  },
  {
    id: "mutuelle",
    label: "MUTUELLE",
    color:
      "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",
    routes: [
      {
        name: "Mutuelle Home",
        description: "Espace mutuelle membre",
        status: "EXISTS",
        route: "/mutuelle",
      },
      {
        name: "Dossiers",
        description: "Dossiers de remboursement",
        status: "EXISTS",
        route: "/mutuelle/dossiers",
      },
      {
        name: "Catalogue",
        description: "Catalogue prestations mutuelle",
        status: "EXISTS",
        route: "/mutuelle/catalogue",
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Status }) {
  if (status === "EXISTS") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        EXISTS
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      MISSING
    </span>
  )
}

function LocaleLinks({ base }: { base: string }) {
  const clean = base.startsWith("/fr") ? base.slice(3) || "/" : base
  const fr = `/fr${clean === "/" ? "" : clean}`
  const en = `/en${clean === "/" ? "" : clean}`
  const ar = `/ar${clean === "/" ? "" : clean}`
  return (
    <div className="mt-1 flex gap-1.5">
      {[
        { label: "FR", href: fr },
        { label: "EN", href: en },
        { label: "AR", href: ar },
      ].map(({ label, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-gray-300 px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {label}
        </a>
      ))}
    </div>
  )
}

function RouteCard({ entry }: { entry: RouteEntry }) {
  const isMissing = entry.status === "MISSING"
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {entry.name}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {entry.description}
          </p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {entry.route}
      </code>

      {entry.note && (
        <p className="text-xs text-amber-600 italic dark:text-amber-400">
          {entry.note}
        </p>
      )}

      {entry.locales && !isMissing && <LocaleLinks base={entry.route} />}

      {!isMissing ? (
        <a
          href={entry.route}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          OPEN ↗
        </a>
      ) : (
        <span className="mt-auto inline-flex items-center justify-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:border-gray-700 dark:text-gray-600">
          NOT AVAILABLE
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VisualMockPage() {
  const totalRoutes = SECTIONS.flatMap((s) => s.routes)
  const existing = totalRoutes.filter((r) => r.status === "EXISTS").length
  const missing = totalRoutes.filter((r) => r.status === "MISSING").length

  return (
    <div className="min-h-screen bg-gray-50 py-10 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4">
        {/* Header */}
        <div className="mb-8 border-b border-gray-200 pb-6 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                Easy2Book — Frontend Visual Hub
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Visual test — ouvrir chaque interface manuellement.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
              {existing} EXISTS
            </span>
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {missing} MISSING
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {totalRoutes.length} total
            </span>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <div key={section.id}>
              <div
                className={`mb-4 inline-flex rounded-md border px-3 py-1 text-xs font-bold tracking-widest ${section.color}`}
              >
                {section.label}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {section.routes.map((entry) => (
                  <RouteCard
                    key={`${section.id}-${entry.name}`}
                    entry={entry}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-gray-200 pt-6 text-center text-xs text-gray-400 dark:border-gray-700">
          Easy2Book v4 — dev tool, non indexé — audit routes 2026-10-04
        </div>
      </div>
    </div>
  )
}
