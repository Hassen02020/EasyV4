import { redirect } from "next/navigation"

export default function HotelsReservationsPage() {
  // Redirect to main reservations page with filter
  redirect("/admin/reservations?type=hotel")
}
