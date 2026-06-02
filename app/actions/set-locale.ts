"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { LOCALE_COOKIE, parseLocale, type Locale } from "@/lib/locale"

export async function setLocale(locale: Locale): Promise<void> {
  const validated = parseLocale(locale)
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, validated, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  revalidatePath("/", "layout")
}
