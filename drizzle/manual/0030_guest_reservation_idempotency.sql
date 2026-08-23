-- Phase 20 — Production Hardening : idempotence guest checkout B2C.
--
-- `withGuestIdempotency` (lib/booking/guest-idempotency.ts) protège
-- uniquement via Redis (get-avant-run-avant-set) : (1) fenêtre de race
-- get→set non atomique pour un double-submit vraiment simultané, (2)
-- AUCUNE protection si Redis est indisponible (dégradation gracieuse
-- documentée = "run() s'exécute simplement à chaque appel, sans cache").
--
-- Backstop DB indépendant de Redis : une clé d'idempotence stable
-- (sha256(token:méthode), déjà calculée par lib/booking/actions.ts) est
-- maintenant posée sur `reservations.guest_idempotency_key` et protégée
-- par un index unique partiel. Un retry après timeout (Redis up ou down)
-- retrouve directement la réservation déjà créée au lieu d'en recréer
-- une seconde ; un double-submit vraiment simultané se résout via la
-- contrainte unique elle-même (Postgres sérialise les deux INSERT
-- concurrents sur la même clé).

alter table reservations add column if not exists guest_idempotency_key text;

create unique index if not exists reservations_guest_idempotency_uniq
  on reservations (guest_idempotency_key)
  where guest_idempotency_key is not null;
