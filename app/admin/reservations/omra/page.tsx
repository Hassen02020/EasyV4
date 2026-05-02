import { redirect } from "next/navigation"

export default function OmraReservationsPage() {
  redirect("/admin/reservations?type=omra")
}
