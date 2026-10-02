"use client"

import { Link } from "@/i18n/navigation"
import { ShoppingCart } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCart } from "@/lib/cart/use-cart"

export function CartBadgeLink({ variant }: { variant: "desktop" | "mobile" }) {
  const t = useTranslations("Panier")
  const cart = useCart()
  const count = cart.lines.length

  if (variant === "mobile") {
    return (
      <Link
        href="/panier"
        className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
      >
        <span className="relative">
          <ShoppingCart className="text-sidebar size-5" />
          {count > 0 ? (
            <span className="bg-accent text-accent-foreground absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
              {count}
            </span>
          ) : null}
        </span>
        <span>{t("pageTitle")}</span>
      </Link>
    )
  }

  return (
    <Link
      href="/panier"
      className="hover:bg-accent hover:text-accent-foreground relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
      aria-label={t("pageTitle")}
    >
      <span className="relative">
        <ShoppingCart className="size-4" />
        {count > 0 ? (
          <span className="bg-accent text-accent-foreground absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
            {count}
          </span>
        ) : null}
      </span>
      {t("cartLabelShort")}
    </Link>
  )
}
