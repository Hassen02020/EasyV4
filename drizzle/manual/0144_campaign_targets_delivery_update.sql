-- 0144 — campaign_targets : droit UPDATE limité au suivi de livraison
-- (CRM-CAMPAIGN-SAFETY-01, écart G-01 de docs/crm/CRM_CARTOGRAPHY.md)
--
-- 0114 a révoqué UPDATE sur campaign_targets pour app_runtime (instantané
-- d'audience immuable), puis 0125 a ajouté delivery_status / delivered_at
-- sans rendre ce droit. La livraison de campagne
-- (lib/crm/campaign-delivery-core.ts) doit pourtant enregistrer le résultat
-- de chaque envoi : sous app_runtime, la mise à jour échouait après l'envoi
-- de l'email (constaté en production : has_table_privilege = false).
--
-- Le droit est accordé COLONNE PAR COLONNE : contact, campagne, prospects et
-- consentement au moment de l'instantané restent non modifiables. La
-- politique RLS existante (campaign_targets_tenant_isolation, FOR ALL) couvre
-- déjà l'UPDATE. Additive et idempotente (un GRANT répété est sans effet).
-- Aucune donnée modifiée.
--
-- Retour arrière :
--   REVOKE UPDATE (delivery_status, delivered_at) ON campaign_targets FROM app_runtime;

GRANT UPDATE (delivery_status, delivered_at) ON campaign_targets TO app_runtime;
