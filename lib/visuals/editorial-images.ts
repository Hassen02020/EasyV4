/**
 * Editorial travel imagery used only as visual fallback/hero imagery.
 *
 * Product-specific supplier/media assets always win. These photos are
 * destination/category context, never presented as the exact hotel/activity
 * being sold when no product media exists.
 *
 * Sources are free-to-use Unsplash photos already verified during the
 * 2026-09-26 visual audit. Keep the Unsplash URLs stable and update this
 * registry when replacing an image.
 */
export const EDITORIAL_VISUALS = {
  home: "https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop",
  hotelsTunisie: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=2400&q=80&auto=format&fit=crop",
  hotelsMonde: "https://images.unsplash.com/photo-1759960967682-963d31993f63?auto=format&fit=crop&fm=jpg&q=60&w=2400",
  omra: "https://images.unsplash.com/photo-1633546707050-88e2b545831c?auto=format&fit=crop&fm=jpg&q=60&w=2400",
  packages: "https://images.unsplash.com/photo-1736354485341-d165463e0133?auto=format&fit=crop&fm=jpg&q=60&w=2400",
  attractions: "https://images.unsplash.com/photo-1770712858088-e53cebfeb7e1?auto=format&fit=crop&fm=jpg&q=60&w=2400",
  flights: "https://images.unsplash.com/photo-1767868277770-d8cb69800992?auto=format&fit=crop&fm=jpg&q=60&w=2400",
  car: "https://images.unsplash.com/photo-1720628909048-a3ce1716033d?auto=format&fit=crop&fm=jpg&q=60&w=2400",
  transfers: "https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop",
  tunisiaCoast: "https://images.unsplash.com/photo-1633936476249-c5a807e46fd4?auto=format&fit=crop&fm=jpg&q=60&w=1600",
  desert: "https://images.unsplash.com/photo-1736354485341-d165463e0133?auto=format&fit=crop&fm=jpg&q=60&w=1600",
  carthage: "https://images.unsplash.com/photo-1770712858088-e53cebfeb7e1?auto=format&fit=crop&fm=jpg&q=60&w=1600",
  istanbul: "https://images.unsplash.com/photo-1759960967682-963d31993f63?auto=format&fit=crop&fm=jpg&q=60&w=1600",
} as const

function isPlaceholderImage(value: string | null | undefined): boolean {
  if (!value) return true
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith("data:image/svg+xml")
    || normalized.includes("/placeholder.")
    || normalized.includes("placeholder-image")
}

/**
 * Resolve a real editorial photo only when the product has no usable media.
 * The title/location matching is intentionally conservative: it is visual
 * context, not a claim that the photo is the exact product.
 */
export function resolveEditorialProductImage(
  module: "package" | "activity",
  title: string,
  location?: string | null,
  existing?: string | null,
): string | null {
  if (!isPlaceholderImage(existing)) return existing ?? null

  const text = `${title} ${location ?? ""}`.toLowerCase()

  if (/(carthage|carthag|sidi bou said|sidi bou|tunis)/i.test(text)) {
    return EDITORIAL_VISUALS.carthage
  }
  if (/(istanbul|turquie|turkey|bosphore|bosphorus)/i.test(text)) {
    return EDITORIAL_VISUALS.istanbul
  }
  if (/(douz|sahara|désert|desert|tataouine|chenini|tozeur)/i.test(text)) {
    return EDITORIAL_VISUALS.desert
  }
  if (module === "activity") return EDITORIAL_VISUALS.tunisiaCoast
  return EDITORIAL_VISUALS.tunisiaCoast
}
