-- =============================================================================
-- Easy2Book — partner_invoices.reservation_id (génération de facture réelle)
-- =============================================================================
-- PROBLÈME : la génération de facture n'a jamais été branchée. Le seul code
-- existant (lib/finance/invoice-generator.ts::generateInvoicePDF) lève une
-- exception inconditionnelle ("jsPDF doit être installé") — jamais appelé
-- par aucun flux de réservation. La page /pro/factures affiche
-- `<InvoicesTable rows={[]} />` — un tableau vide codé en dur, jamais lu
-- depuis `partner_invoices`. Zéro facture n'a donc jamais été créée pour
-- une seule réservation réelle.
--
-- `partner_invoices` existe déjà (migration 0009), pensée pour de la
-- facturation consolidée B2B (lineItems jsonb = plusieurs réservations sur
-- une facture). On ajoute une colonne `reservation_id` NULLABLE avec un
-- index UNIQUE partiel-sur-NULL (comportement standard Postgres : NULL ≠
-- NULL, donc plusieurs factures futures à reservation_id NULL — factures
-- consolidées multi-réservations — restent possibles) pour garantir, au
-- niveau DB et pas seulement applicatif, qu'une réservation facturée
-- individuellement ne peut jamais avoir deux factures : deux appels
-- concurrents à generateInvoiceForReservation() pour la même réservation
-- se disputent le même conflit unique, un seul gagne (INSERT ... ON
-- CONFLICT (reservation_id) DO NOTHING RETURNING *, voir
-- lib/finance/invoice-actions.ts).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0019_partner_invoices_reservation_link.sql
--
-- Idempotent : peut être réexécuté sans effet de bord.
-- Déjà appliqué en production (projet Supabase vqhuptgjhoornteibbpj) via
-- Supabase MCP le 2026-08-20, dans le cadre de cet audit.
-- =============================================================================

BEGIN;

ALTER TABLE partner_invoices
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES reservations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS partner_invoices_reservation_uniq
  ON partner_invoices (reservation_id)
  WHERE reservation_id IS NOT NULL;

COMMIT;
