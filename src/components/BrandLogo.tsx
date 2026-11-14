const base = import.meta.env.BASE_URL

/**
 * The shop's logo (the artwork supplied by the owner). It already contains the shop name,
 * so callers must not repeat the name next to it. `compact` is the cropped emblem + wordmark
 * for tight spaces (header, sidebar); the full version also carries the tagline and the
 * « Vente en gros | Détail » banner.
 */
export function BrandLogo({ name, variant = 'compact', className }: { name: string; variant?: 'compact' | 'full'; className?: string }) {
  const full = variant === 'full'
  const w = full ? 960 : 715
  const h = full ? 640 : 375
  return (
    <img
      src={`${base}${full ? 'logo.webp' : 'logo-header.webp'}`}
      alt={name}
      width={w}
      height={h}
      decoding="async"
      className={`brandlogo${className ? ` ${className}` : ''}`}
    />
  )
}
