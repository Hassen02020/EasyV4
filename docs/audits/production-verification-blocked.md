# Easy2Book — Vérification production (Vercel/Supabase) : BLOQUÉE

Date : 2026-09-11. Tenté depuis la session `audit/e2e-certification`.

## Ce qui a été demandé

1. Vérifier les variables Supabase/Vercel de production.
2. Faire un smoke test réel sur l'URL Vercel de production (home, connexion, recherche Hôtel Tunisie,
   réservation, réservation Vol, réservation Hôtel Monde, compte client, admin, voucher,
   annulation/remboursement).
3. Capturer des captures d'écran de production.

**Aucun des trois n'a pu être réalisé depuis cette session.** Deux blocages structurels distincts,
chacun vérifié fraîchement (pas une simple répétition d'un échec précédent) :

## 1. Connecteur Vercel MCP — projet introuvable

- `list_teams` → réussit, renvoie l'équipe `Easy2Book` (`team_32LT0Y5AfZ3sMn86l736IXtD`).
- `list_projects` (avec cet ID d'équipe) → **`{"projects": []}`**, liste vide.
- `get_project` avec le slug `easyv4-golive` (nom de projet précédemment communiqué) →
  **404 Not Found**, même en lookup direct (pas seulement absent d'une liste paginée).
- Aucun fichier `.vercel/project.json` dans le dépôt (jamais lié localement).

Le connecteur voit bien le compte/l'équipe, mais aucun projet dessous — que ce soit parce que le
projet a été supprimé/renommé depuis, ou un problème de synchronisation côté connecteur (déjà observé
lors d'un cycle antérieur de cette même session : création de projet échouant en boucle avec des 404
incohérents).

**Conséquence** : impossible de lire les variables d'environnement production (`DATABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, etc.) via l'API Vercel depuis cette session.

## 2. Egress réseau — `*.vercel.app` bloqué par la politique du proxy sandbox

Test direct (`WebFetch` sur `https://claudegolive.vercel.app`, l'URL précédemment communiquée comme
production) :

```
{"error_type":"EGRESS_BLOCKED","domain":"claudegolive.vercel.app",
 "message":"Access to claudegolive.vercel.app is blocked by the network egress proxy."}
```

Confirmé une seule fois (pas de tentative répétée — la politique de ce sandbox interdit explicitement
de re-essayer un refus de politique réseau, voir `/root/.ccr/README.md`). Le statut du proxy
(`$HTTPS_PROXY/__agentproxy/status`) montre une politique d'allowlist stricte qui bloque également des
domaines aussi génériques que `www.google.com` — ce n'est pas spécifique à `vercel.app`, c'est la
politique réseau de cet environnement sandbox.

**Conséquence** : même avec un accès Vercel MCP fonctionnel, **aucun navigateur/fetch de ce sandbox ne
peut atteindre une URL `*.vercel.app` pour faire un smoke test réel ou capturer des captures d'écran
de production.**

## Ce qui EST vérifié à la place

L'audit fonctionnel complet (voir `global-6-modules-final-audit.md`) a été mené sur une infra LOCALE
qui reproduit fidèlement la configuration de production (Postgres 16 avec RLS forcée identique,
`next build` + `next start` — vrai build de production, pas `next dev`). C'est le niveau de rigueur
maximal atteignable depuis ce sandbox — mais ce n'est PAS un test de l'environnement Vercel/Supabase
réel : cela ne peut pas détecter un problème de variable d'environnement production mal configurée,
de région Supabase, de edge config, de domaine custom, de cache CDN Vercel, etc.

## Ce qu'il faut pour débloquer

L'un des deux, au choix :

1. **Reconnecter/re-autoriser le connecteur Vercel** côté utilisateur (claude.ai → Connecteurs) pour
   que le projet `easyv4-golive` (ou son nom actuel) redevienne visible par `list_projects`/
   `get_project` — puis relancer la vérification des variables d'environnement (sans jamais afficher
   leur valeur, seulement confirmer leur présence/absence).
2. **Fournir un accès alternatif** : l'utilisateur peut lancer le smoke test lui-même en suivant un
   script de test fourni (les 10 parcours demandés, en clair, prêts à copier-coller dans un navigateur)
   et rapporter les résultats/captures, OU lancer une session Claude Code dans un environnement dont la
   politique réseau autorise `*.vercel.app`.

## Verdict

🔴 **GO-LIVE non déclarable depuis cette session** — les points 2, 3, 4 de la demande (variables prod,
smoke test réel, captures production) restent non réalisés, pas par manque d'effort mais par deux
blocages d'infrastructure confirmés et documentés ci-dessus. Déclarer GO-LIVE sans cette vérification
irait directement à l'encontre de la règle explicite déjà posée dans cette mission : ne jamais
transformer un "build PASS" (local) en "GO-LIVE" (production non vérifiée).
