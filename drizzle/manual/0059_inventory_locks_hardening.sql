-- Corrige deux défauts de `inventory_locks` découverts en connectant
-- lib/booking/inventory.ts::acquireLock() à de vrais tunnels de réservation
-- (Hôtels Tunisie/Hôtels Monde/Vols, chantier "Inventory Hold Integration") —
-- jamais déclenchés avant parce qu'aucun appelant réel n'existait :
--
-- 1. `redis_key` n'avait qu'un index simple, pas une contrainte unique.
--    `acquireLock()` fait `.onConflictDoUpdate({ target: [redisKey] })`, qui
--    exige une vraie contrainte unique pour l'inférence ON CONFLICT —
--    reproduit directement : "there is no unique or exclusion constraint
--    matching the ON CONFLICT specification". Sans impact sur la décision
--    d'exclusivité elle-même (Redis seul décide, cette table n'est qu'une
--    trace audit fire-and-forget — voir l'en-tête de inventory.ts), mais
--    l'écriture échouait silencieusement à chaque appel, donc l'audit
--    trail restait vide.
--
-- 2. `item_id`/`redis_key` (varchar(256)) trop courts pour des tokens
--    d'offre réels. Mesuré en direct : un token Hôtels Monde/Vols signé
--    (HMAC, payload JSON encodé) fait ~330-410 caractères — dépassant à
--    lui seul la colonne `item_id`. Élargis vers `text` (pas une nouvelle
--    limite arbitraire qui pourrait être dépassée à nouveau) — Postgres
--    n'a aucune pénalité de performance ou de stockage pour `text` vs
--    `varchar(n)` sur une table de cette taille.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0059_inventory_locks_hardening.sql

begin;

alter table inventory_locks alter column item_id type text;
alter table inventory_locks alter column redis_key type text;

drop index if exists inv_locks_redis_key_idx;
create unique index if not exists inv_locks_redis_key_uniq on inventory_locks(redis_key);

commit;
