/**
 * Pure synchronous helpers for the 10-state flight booking machine.
 * No server directive — safe to import from both server actions and tests.
 */

export type FlightStatus =
  | "PENDING"
  | "PRICE_RECHECK"
  | "PRICE_CHANGED"
  | "APPROVED"
  | "BOOKING_IN_PROGRESS"
  | "BOOKED"
  | "TICKETING_IN_PROGRESS"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"

export type ReservationStatus = "pending" | "on_request" | "confirmed" | "cancelled"

export function mapFlightStatusToReservation(status: FlightStatus): ReservationStatus {
  switch (status) {
    case "PENDING":
    case "PRICE_RECHECK":
    case "PRICE_CHANGED":
      return "pending"
    case "APPROVED":
    case "BOOKING_IN_PROGRESS":
    case "BOOKED":
    case "TICKETING_IN_PROGRESS":
      return "on_request"
    case "CONFIRMED":
      return "confirmed"
    case "FAILED":
    case "CANCELLED":
      return "cancelled"
  }
}
