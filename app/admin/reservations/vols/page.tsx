import { redirect } from "next/navigation"

export default function VolsReservationsPage() {
  redirect("/admin/reservations?type=flight")
}
