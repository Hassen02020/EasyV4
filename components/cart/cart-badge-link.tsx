"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"
import { useCart } from "@/lib/cart/use-cart"

export function CartBadgeLink({ variant }: { variant: "desktop" | "mobile" }) {
  const cart = useCart()
  const count = cart.lines.length

  if (variant === "mobile") {
    return (
      <Link
        href="/panier"
        className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
      >
        <span className="relative">
          <ShoppingCart className="size-5 text-sidebar" />
          {count > 0 ? (
            <span className="bg-accent text-accent-foreground absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
              {count}
            </span>
          ) : null}
        </span>
        <span>Mon panier</span>
      </Link>
    )
  }

  return (
    <Link
      href="/panier"
      className="relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label="Mon panier"
    >
      <span className="relative">
        <ShoppingCart className="size-4" />
        {count > 0 ? (
          <span className="bg-accent text-accent-foreground absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
            {count}
          </span>
        ) : null}
      </span>
      Panier
    </Link>
  )
}
