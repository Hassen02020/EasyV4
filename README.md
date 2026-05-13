# TunisiaGo

Site **TunisiaGo** : agence de voyage en ligne Tunisienne — moteur de réservation 7 modules (vols, hôtels Tunisie/Monde, Omra, voyages organisés, transferts, location de voiture), page de résultats de recherche d'hôtels et back-office d'administration.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Tailwind CSS v4** + **shadcn/ui** (style "new-york")
- **TypeScript 5.7**
- **Sonner** pour les toasts
- **date-fns** (locale `fr`) pour le formatage de dates
- pnpm pour la gestion de dépendances

## Démarrage

```bash
pnpm install
pnpm dev
```

L'app tourne sur [http://localhost:3000](http://localhost:3000).

## Scripts

| Commande         | Action                                                         |
| ---------------- | -------------------------------------------------------------- |
| `pnpm dev`       | Démarre le serveur de dev (Turbopack)                          |
| `pnpm build`     | Build de production                                            |
| `pnpm start`     | Sert le build de production                                    |
| `pnpm lint`      | Lint le code (ESLint + next/core-web-vitals + next/typescript) |
| `pnpm typecheck` | Vérifie les types TypeScript (`tsc --noEmit`)                  |

## Structure

```
app/
├── layout.tsx              # Layout racine (Geist + Tailwind + Sonner + Analytics)
├── page.tsx                # Page d'accueil (Header + BookingEngine + FlashOffers + OmratySection + Footer)
├── globals.css             # Variables CSS (palette bleu/or)
├── admin/
│   ├── layout.tsx          # Sidebar admin (TunisiaGo Backoffice)
│   ├── page.tsx            # Dashboard (CA, réservations, erreurs API)
│   └── reservations/       # Gestion des réservations (hôtels, vols, omra)
└── hotels/
    └── search/
        └── page.tsx        # Page de résultats de recherche d'hôtels

components/
├── header.tsx              # Header public (FR/AR + TND + Help + My Bookings + Connexion)
├── footer.tsx              # Footer public (badges Paiement / Support / MyGo / Agence + paiements)
├── tunisia-go-logo.tsx     # Logo SVG inline TunisiaGo
├── booking-engine.tsx      # Moteur de réservation (7 onglets)
├── hotels-tunisie-search.tsx # Formulaire de recherche d'hôtels en Tunisie (form + redirect)
├── flash-offers.tsx        # 3 cartes d'offres flash (Istanbul / Djerba / Omra)
├── omraty-section.tsx      # Section Omraty
├── theme-provider.tsx      # Provider next-themes
├── search-header.tsx       # Header de la page résultats
├── filter-sidebar.tsx      # Sidebar de filtres
├── hotel-card.tsx          # Carte d'hôtel
├── hotel-listings.tsx      # Liste des hôtels (mock)
├── booking-form.tsx        # Formulaire de réservation
└── ui/                     # Composants shadcn (accordion, button, dialog, …)

hooks/                      # use-mobile, use-toast
lib/utils.ts                # Helpers (cn)
public/                     # Icônes et placeholders
```

## Modules de réservation

Le moteur de réservation expose 7 onglets, chacun avec son propre formulaire :

| Onglet                | Champs                                       | Comportement                          |
| --------------------- | -------------------------------------------- | ------------------------------------- |
| **Vols**              | Départ, Destination, Dates, Classe           | Toast (à câbler à l'API)              |
| **Hôtels Tunisie**    | Ville, Dates, Pax, Étoiles, Disponibilité    | Redirection vers `/hotels/search?...` |
| **Hôtels Monde**      | Destination, Check-in, Check-out             | Toast (à câbler à l'API)              |
| **Omraty**            | Programme, Mois, Distance Haram, Type de vol | Toast (à câbler à l'API)              |
| **Voyages Organisés** | Destination, Période, Durée, Voyageurs       | Toast (à câbler à l'API)              |
| **Transferts**        | Lieu de prise / dépose, Date, Passagers      | Toast (à câbler à l'API)              |
| **Car**               | Lieu, Date prise / retour, Catégorie         | Toast (à câbler à l'API)              |

Seul **Hôtels Tunisie** est entièrement fonctionnel : il construit un `HotelSearchRequest` typé (compatible API MyGo) et redirige vers la page de résultats. Les autres modules affichent un toast « bientôt disponible » et seront connectés à leurs APIs respectives.

## Flux utilisateur

1. L'utilisateur arrive sur **`/`** et choisit un module dans le moteur de réservation.
2. Pour **Hôtels Tunisie**, il est redirigé vers **`/hotels/search?city=…&checkin=…&checkout=…&adults=…`**.
3. La page de résultats lit ces query params via `useSearchParams` et les affiche dans son `SearchHeader`.
4. L'utilisateur peut cliquer **Réserver** sur une chambre, ce qui affiche le `BookingForm`.

## Back-office

L'espace `/admin` est public en l'état (à protéger avec une authentification réelle avant mise en production). Il expose :

- `/admin` — tableau de bord (CA, réservations, erreurs API MyGo, clients actifs)
- `/admin/reservations` — table de toutes les réservations
- `/admin/reservations/{vols,hotels,omra}` — réservations filtrées par module
- `/admin/config`, `/admin/inventory`, `/admin/support` — pages stub à implémenter

## Origine du code

Ce projet est issu de la fusion de deux templates v0.app (`fichier1` = site + admin, `fichier2` = page de résultats de recherche d'hôtels) en une seule application Next.js cohérente, puis rebrandé **TunisiaGo** avec ajout des modules **Voyages Organisés** et **Car**.
