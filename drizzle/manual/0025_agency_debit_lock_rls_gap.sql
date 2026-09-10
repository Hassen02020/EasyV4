-- Comble un second trou RLS sur `agencies`, trouvé en Phase 14.3 (validation
-- live) : `SELECT ... FOR UPDATE` consulte aussi la policy UPDATE de la
-- table (comportement documenté Postgres — verrouiller une ligne "for
-- update" exige la permission UPDATE, pas seulement SELECT). Or `agencies`
-- n'a aucune policy UPDATE utilisable par une session tenant normale
-- (agencies_admin_write exige is_super_admin()) — donc l'étape 1 de
-- debitPartnerCredit() (SELECT ... FOR UPDATE sur agencies, AVANT même
-- d'atteindre set_agency_deposit_balance()) échouait silencieusement pour
-- CHAQUE réservation B2B réelle (isSuperAdmin toujours false pour ce
-- chemin), renvoyant "AGENCY_NOT_FOUND" alors que l'agence existe bel et
-- bien. Reproduit en direct contre ce projet (policies identiques) via un
-- miroir Postgres local sous le rôle app_runtime réel.
--
-- Corrigé avec le même pattern que set_agency_deposit_balance() (migration
-- 0020) : une fonction SECURITY DEFINER dédiée qui fait elle-même la
-- vérification d'autorisation (current_agency_id() = p_agency_id OR
-- is_super_admin()) puis le verrou, au lieu d'élargir la policy RLS de la
-- table (qui resterait alors trop permissive pour un UPDATE direct sur
-- d'autres colonnes sensibles : matricule_fiscale, agency_type, status...).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0025_agency_debit_lock_rls_gap.sql
--
-- Dépend de : 0012 (current_agency_id()/is_super_admin()), 0020 (précédent identique).
-- Idempotent : peut être réexécuté sans effet de bord (CREATE OR REPLACE).

begin;

create or replace function lock_agency_for_debit(p_agency_id uuid)
returns table(id uuid, deposit_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (p_agency_id = current_agency_id() or is_super_admin()) then
    raise exception 'FORBIDDEN: cannot lock another agency''s wallet balance'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.deposit_balance from agencies a where a.id = p_agency_id for update;
end;
$$;

grant execute on function lock_agency_for_debit(uuid) to authenticated, service_role, app_runtime;

commit;
