"use client"

import { useEffect } from "react"
import { useLanguageCurrency } from "@/lib/i18n/LanguageCurrencyContext"

export function HtmlAttributes() {
  const { language } = useLanguageCurrency()

  useEffect(() => {
    const html = document.documentElement
    html.lang = language
    html.dir = language === "ar" ? "rtl" : "ltr"
  }, [language])

  return null
}
