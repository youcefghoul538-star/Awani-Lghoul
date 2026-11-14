import { useCatalog } from '../state/hooks'
import type { Bundle } from '../types'
import { ProductImage } from './ProductBits'

/** Small 2×2 collage of a bundle's first items. */
export function BundleThumb({ bundle }: { bundle: Bundle }) {
  const { productById } = useCatalog()
  const items = bundle.items.flatMap((i) => {
    const p = productById.get(i.productId)
    return p ? [p] : []
  })
  return (
    <div className="bthumb" aria-hidden="true">
      {items.slice(0, 4).map((p) => (
        <ProductImage key={p.id} product={p} />
      ))}
    </div>
  )
}
