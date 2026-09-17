-- Chantier "Approfondir le branding White-Label" (docs/audits/architecture-vision-audit.md).
--
-- `agencies.brand_name`/`logo_url` sont déjà réellement éditables en
-- self-service (/pro/etablissement, RLS 0042) et déjà consommées par le
-- storefront public (proxy.ts::resolveTenantForHost -> header-wrapper.tsx).
-- La profondeur de branding s'arrêtait là : aucune couleur d'accent par
-- agence. Colonne additive, nullable — NULL = comportement inchangé (teinte
-- corail par défaut de app/globals.css, --primary).
--
-- Format volontairement restreint à `#RRGGBB` (7 caractères) : c'est la
-- seule forme de couleur CSS acceptée par la validation Zod côté action
-- d'écriture (lib/pro/etablissement-actions.ts) — jamais une fonction CSS
-- arbitraire (oklch()/rgb()/calc()), pour ne jamais avoir à faire confiance
-- à une chaîne libre injectée dans un attribut `style`.
--
-- Aucune nouvelle policy RLS nécessaire : `agencies_partner_self_write`
-- (0042) et `agencies_admin_write` (0001) couvrent déjà la ligne entière
-- (RLS Postgres ne filtre jamais par colonne) — la protection par colonne
-- reste, comme pour brand_name/logo_url, le `.set()` explicite de
-- lib/pro/etablissement-core.ts.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0057_agency_primary_color.sql

begin;

alter table agencies add column if not exists primary_color varchar(7);

commit;
