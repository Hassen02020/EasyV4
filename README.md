# Easy2Book

Site Easy2Book : moteur de réservation (vols, hôtels Tunisie/Monde, Omra, transferts), page de résultats de recherche d'hôtels et back-office d'administration.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Tailwind CSS v4** + **shadcn/ui** (style "new-york")
- **TypeScript 5.7**
- pnpm pour la gestion de dépendances

## Démarrage

```bash
pnpm install
pnpm dev
```

L'app tourne sur [http://localhost:3000](http://localhost:3000).

## Scripts

| Commande | Action |
|---|---|
| `pnpm dev` | Démarre le serveur de dev (Turbopack) |
| `pnpm build` | Build de production |
| `pnpm start` | Sert le build de production |
| `pnpm lint` | Lint le code (ESLint + next/core-web-vitals + next/typescript) |
| `pnpm typecheck` | Vérifie les types TypeScript (`tsc --noEmit`) |

## Structure

```
app/
├── layout.tsx              # Layout racine (Geist + Tailwind + Analytics)
├── page.tsx                # Page d'accueil (Header + BookingEngine + FlashOffers + OmratySection + Footer)
├── globals.css             # Variables CSS (palette bleu/or)
├── admin/
│   ├── layout.tsx          # Sidebar admin
│   ├── page.tsx            # Dashboard (CA, réservations, erreurs API)
│   └── reservations/
│       ├── page.tsx        # Liste de toutes les réservations
│       ├── hotels/         # Réservations hôtels
│       ├── omra/           # Réservations Omra
│       └── vols/           # Réservations vols
└── hotels/
    └── search/
        └── page.tsx        # Page de résultats de recherche d'hôtels

components/
├── header.tsx              # Header public
├── footer.tsx              # Footer public
├── booking-engine.tsx      # Moteur de réservation (5 onglets)
├── hotels-tunisie-search.tsx # Formulaire de recherche d'hôtels en Tunisie
├── flash-offers.tsx        # Carrousel d'offres flash
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
public/                     # Icônes Easy2Book et placeholders
```

## Flux utilisateur

1. L'utilisateur arrive sur **`/`** (page d'accueil) et utilise le moteur **Hôtels Tunisie**.
2. À la soumission du formulaire, il est redirigé vers **`/hotels/search?city=…&checkin=…&checkout=…&adults=…`** avec ses critères en query params.
3. La page de résultats lit ces query params via `useSearchParams` et les affiche dans son `SearchHeader`.
4. L'utilisateur peut cliquer **Réserver** sur une chambre, ce qui affiche le `BookingForm`.

## Back-office

L'espace `/admin` est public en l'état (à protéger avec une authentification réelle avant mise en production).

## Origine du code

Ce projet est issu de la fusion de deux templates v0.app (`fichier1` = site + admin Easy2Book, `fichier2` = page de résultats de recherche d'hôtels) en une seule application Next.js cohérente.
