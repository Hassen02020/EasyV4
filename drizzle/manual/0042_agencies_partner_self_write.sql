-- Autorise un partenaire B2B à modifier SA PROPRE ligne `agencies` — jusqu'ici
-- seule `agencies_admin_write` (0001, FOR ALL USING (is_super_admin()))
-- existait, donc /pro/etablissement ne pouvait techniquement jamais
-- persister quoi que ce soit même une fois une Server Action écrite (RLS
-- aurait filtré silencieusement la ligne). components/pro/etablissement-form.tsx
-- affichait déjà, honnêtement, "pas encore disponible" plutôt qu'un faux
-- succès — voir lib/pro/etablissement-actions.ts pour l'action qui utilise
-- enfin cette policy.
--
-- RLS ne protège ici que "cette ligne appartient-elle à l'agence
-- courante ?" — jamais les colonnes individuelles (Postgres RLS ne filtre
-- pas par colonne). La protection contre l'écriture de colonnes sensibles
-- (deposit_balance, credit_low_threshold, agency_type, status, domain,
-- slug — jamais éditables en self-service) est appliquée par l'action
-- elle-même : son `.set()` ne liste jamais que les champs de profil
-- (nom commercial, contact, adresse, préférences d'affichage).
CREATE POLICY "agencies_partner_self_write" ON agencies
  FOR UPDATE
  USING (id = current_agency_id())
  WITH CHECK (id = current_agency_id());
