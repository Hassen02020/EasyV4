import { NextRequest, NextResponse } from "next/server"
import { LOCALE_COOKIE, parseLocale } from "@/lib/locale"
import { safeInternalRedirect } from "@/lib/api/safe-redirect"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const locale = parseLocale(searchParams.get("locale"))
  const redirectTo = safeInternalRedirect(searchParams.get("redirectTo"), origin, "/")

  const response = NextResponse.redirect(new URL(redirectTo, request.url))
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  return response
}
