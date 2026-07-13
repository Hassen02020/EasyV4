"use server"

import { getMarginKPIs } from "@/lib/reporting/margin-analytics"

export async function fetchMarginKPIs(
  agencyId: string,
  startDate: Date,
  endDate: Date,
) {
  return getMarginKPIs(agencyId, startDate, endDate)
}
