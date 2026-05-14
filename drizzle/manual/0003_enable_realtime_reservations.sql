-- Enable Supabase Realtime on the `reservations` table.
--
-- Required for the Front-Office `/booking/confirmation/[ref]` page to receive
-- live `UPDATE` events (status change) pushed by the admin Back-Office without
-- a full-page refresh. See `components/booking/confirmation-status-badge.tsx`
-- and `lib/supabase/use-realtime-table.ts`.
--
-- Idempotent: only adds the table if it is not already in the publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations';
  END IF;
END
$$;
