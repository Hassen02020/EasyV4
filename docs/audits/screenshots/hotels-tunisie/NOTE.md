# Hôtels Tunisie — captures 01 à 09 : N/A ce cycle

Aucune capture neuve n'a été produite dans ce dossier lors du cycle "Final Screenshot
Certification" (2026-09-11). **Raison exacte, pas une supposition** :

Le serveur local ne peut être exécuté que via `next build` + `next start` dans ce sandbox
(`next dev` reste bloqué indéfiniment en compilation — confirmé avec Turbopack ET avec
`--webpack`, donc un problème d'environnement sandbox, pas un problème de bundler). Or
`next start` compile le code avec `process.env.NODE_ENV` remplacé en dur par la chaîne
littérale `"production"` au moment du build (comportement standard de Next.js/webpack :
remplacement de `process.env.NODE_ENV` à la compilation, pas une lecture à l'exécution).

Le garde-fou de sécurité `lib/mygo/config.ts::resolveMyGoMode()` refuse `MYGO_MODE=virtual`
dès que `NODE_ENV === "production"` — un garde-fou légitime, ajouté délibérément lors d'un
cycle antérieur de cette même certification pour empêcher tout déploiement réel de tourner
en mode fournisseur simulé. Comme ce remplacement a lieu AU BUILD, aucune variable
d'environnement positionnée au démarrage (`NODE_ENV=development`, `NODE_ENV=test`, etc.) ne
peut le contourner : plusieurs combinaisons ont été testées ce cycle, toutes bloquées de la
même façon (voir `docs/audits/global-6-modules-final-audit.md`, section 3, pour le détail
technique complet des tentatives).

**Aucun contournement du garde-fou n'a été tenté** (l'affaiblir irait à l'encontre de sa
raison d'être, et le code métier n'a pas été modifié pour cette certification).

## Ce qui EXISTE déjà comme preuve réelle (pas fabriquée, pas re-datée)

Un cycle de certification antérieur de cette même session a produit un run E2E réel et
complet pour ce module, dont les captures existent toujours, inchangées, à leur emplacement
d'origine (racine de `docs/audits/screenshots/`, PAS dans ce dossier — pour ne jamais laisser
croire qu'elles proviennent de ce cycle) :

```
docs/audits/screenshots/dashboard-ops-01-step1-offer.png
docs/audits/screenshots/dashboard-ops-02-travelers-form.png
docs/audits/screenshots/dashboard-ops-03-checkout.png
docs/audits/screenshots/dashboard-ops-04-confirmation.png
docs/audits/screenshots/dashboard-ops-05-admin-search.png
docs/audits/screenshots/dashboard-ops-06-detail-pending.png
docs/audits/screenshots/dashboard-ops-07-detail-verified.png
docs/audits/screenshots/dashboard-ops-08-status-modified.png
docs/audits/screenshots/dashboard-ops-09-detail-refunded.png
docs/audits/screenshots/dashboard-ops-10-permissions-pro-blocked-from-admin.png
docs/audits/screenshots/dashboard-ops-11-isolation-pro-reservations-empty.png
```

Ces fichiers sont réels (issus d'un vrai run Playwright, réservation réelle créée en base
— voir `e2e-certification-report.md` section 3ter pour la preuve DB complète), datés du
même jour mais d'un cycle antérieur — ils ne sont ni copiés ni renommés ici pour rester
strictement fidèles à la règle "aucune capture d'un ancien run présentée comme nouvelle".
