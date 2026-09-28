-- Flight Bridge — wire flight_bookings into the shared Booking Core
-- flight_bookings.reservation_id → reservations.id
-- This makes flights visible to CRM, Finance, Customer 360, and Admin history
-- without any changes to those modules: they already query `reservations`.

--> statement-breakpoint
ALTER TABLE "flight_bookings"
  ADD COLUMN "reservation_id" uuid REFERENCES reservations(id) ON DELETE SET NULL;

--> statement-breakpoint
CREATE INDEX "flight_bookings_reservation_idx" ON "flight_bookings"("reservation_id");

-- Travelport is a real GDS — add it as a valid reservation source.
--> statement-breakpoint
ALTER TYPE "reservation_source" ADD VALUE IF NOT EXISTS 'travelport';
