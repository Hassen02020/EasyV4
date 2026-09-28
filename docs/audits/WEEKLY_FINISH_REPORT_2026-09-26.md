# Easy2Book — Fin de chantier semaine — 26/09/2026

## Cible

- Dépôt : Hassen02020/EasyV4
- Branche de travail : `chore/vercel-prod-visual-finish-2026-09-26`
- Déploiement Vercel visé : `easy2book/easy2book-new`
- Périmètre : **Easy2Book uniquement**. Aucun autre projet Vercel n'est ciblé.

## Corrections réalisées dans le code

### 1. Visuel réel des pages modules
Le composant partagé `components/module-hero.tsx` accepte maintenant `imageUrl`.
Les pages publiques suivantes sont câblées sur une photographie éditoriale réelle, avec overlay de marque pour conserver la lisibilité :

- Hôtels Tunisie
- Hôtels Monde
- Omraty
- Voyages Organisés
- Attractions
- Vols
- Transferts
- Car

Le système conserve un fallback gradient si une page n'envoie pas d'image.

### 2. Cartes produits
Le code actuel possède déjà le Media System :
`coverMediaUrl` prioritaire, puis `coverImage` legacy, puis fallback graphique.
Aucune fausse photo n'a été injectée dans la base produit.

Pour obtenir de vraies photos produit sur les cartes Omraty / Voyages / Attractions, il faut renseigner les médias via le back-office/Media System. C'est préférable à une association automatique arbitraire entre un produit et une photo.

### 3. Homepage
Le hero principal possède déjà une photographie réelle de Sidi Bou Saïd dans `components/booking-engine.tsx`. Aucun remplacement inutile n'a été fait.

### 4. Production hardening déjà présent
Le dépôt contient déjà les protections récentes :
- `PRICE_TOKEN_SECRET` obligatoire et non-dev en production.
- `/api/health`.
- Sentry client/server configuré dans le code.
- `vercel.json` sans la clé invalide `healthcheck`.
- 5 Cron Jobs déclarés.
- certifications E2E MyGo hôtels et vols.
- audit financier reproductible.

## Vérifications nécessaires dans Vercel

Le code ne peut pas lire les secrets du projet Vercel depuis GitHub. Dans le projet `easy2book-new`, vérifier les variables Production :

### Obligatoires
- `DATABASE_URL` — pooler Supabase, port 6543
- `DATABASE_DIRECT_URL` — migrations uniquement
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MYGO_MODE=live`
- `MYGO_API_BASE_URL`
- `MYGO_LOGIN`
- `MYGO_PASSWORD`
- `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL=https://easy2book.tn`
- `PRICE_TOKEN_SECRET`

### Recommandés / selon modules
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `HEALTH_SECRET`
- `RESEND_API_KEY`
- `INNGEST_SIGNING_KEY`
- `INNGEST_EVENT_KEY`
- clés SPS/Paymee/Stripe selon le moyen de paiement réellement activé
- clés WhatsApp si le canal doit être actif

### À ne jamais activer en production
- `MYGO_MODE=virtual`
- secrets `*-dev-secret-not-for-prod`
- valeurs `changeme-*`
- `PAYMENT_MODE=virtual`

## Feature flags de lancement

État déclaré dans `.env.example` :
- Hôtels Tunisie : actif
- Hôtels Monde : désactivé
- Vols : désactivé
- Omra : actif
- Voyages Organisés : actif
- Transferts : actif
- Car : désactivé

Cette configuration doit rester cohérente avec les fournisseurs réellement branchés en Production.

## Point important sur le déploiement

Le dépôt est prêt pour un déploiement automatique via le projet Vercel connecté à GitHub, mais la console Vercel et ses variables/secrets ne sont pas accessibles depuis le connecteur GitHub utilisé ici. Donc ce rapport **ne prétend pas que la Production Vercel a été vérifiée live**.

Après merge sur `main`, contrôler dans `easy2book-new` :
1. Deployment = Ready
2. Build = success
3. `/api/health` = OK
4. homepage = visuel réel
5. /hotels, /hotels-monde, /omra, /packages, /attractions = hero photo
6. recherche hôtel Tunisie = résultats réels
7. booking hôtel = checkout + confirmation
8. aucune variable dev/virtual en Production
9. logs Vercel sans erreur au premier trafic

## Ce qui reste réellement à finir

### P0 — avant annonce commerciale large
- Vérification live du deployment Vercel Production.
- Vérification des variables Production.
- Vérification MyGo live.
- Vérification paiement réel si le paiement carte doit être activé.
- Vérification mobile des parcours B2C.

### P1 — cette prochaine itération
- Renseigner les vraies photos produit dans Media System pour les produits effectivement commercialisés.
- Compléter les visuels éditoriaux destination par destination.
- Finir le câblage fournisseur commercial réel pour les modules encore virtuels.
- Vérifier les parcours B2C de bout en bout après chaque activation de feature flag.

### Ne pas rouvrir cette semaine
- Nouvelle architecture Travel Commerce OS.
- Nouvelles familles de produits.
- CRM complet.
- Nouvelles intégrations fournisseurs non nécessaires au lancement.

## Conclusion

Le chantier de cette semaine doit se terminer par **un déploiement propre de la version actuelle**, pas par l'ajout de nouvelles idées.

Le code dispose maintenant d'un vrai système de hero photographique partagé et les modules publics principaux peuvent présenter une identité visuelle de plateforme de voyage plutôt qu'un simple aplat de couleur.

La dernière étape opérationnelle est la certification dans le projet Vercel `easy2book-new` avec les vraies variables Production et les parcours B2C réels.
