/**
 * Neutral generated illustrations used when a product has no uploaded photo.
 * Deliberately simple and generic: they are placeholders, not product photography.
 */
const GLYPHS: Record<string, (a: string, b: string) => string> = {
  cuisine: (a, b) =>
    `<rect x="50" y="88" width="100" height="62" rx="9" fill="${a}"/><rect x="43" y="77" width="114" height="14" rx="7" fill="${b}"/><circle cx="100" cy="68" r="8" fill="${b}"/><rect x="26" y="102" width="24" height="9" rx="4.5" fill="${b}"/><rect x="150" y="102" width="24" height="9" rx="4.5" fill="${b}"/>`,
  vaisselle: (a, b) =>
    `<ellipse cx="100" cy="132" rx="72" ry="22" fill="${a}"/><ellipse cx="100" cy="126" rx="52" ry="14" fill="${b}"/><path d="M72 46h56l-7 50a21 8 0 0 1-42 0z" fill="${a}" opacity=".9"/>`,
  rangement: (a, b) =>
    `<rect x="44" y="70" width="112" height="82" rx="9" fill="${a}"/><rect x="44" y="70" width="112" height="24" rx="7" fill="${b}"/><rect x="82" y="110" width="36" height="9" rx="4.5" fill="${b}"/>`,
  entretien: (a, b) =>
    `<path d="M56 84h88l-10 66H66z" fill="${a}"/><ellipse cx="100" cy="84" rx="44" ry="9" fill="${b}"/><path d="M56 84Q100 24 144 84" stroke="${b}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  bain: (a, b) =>
    `<path d="M100 38C100 38 54 94 54 126a46 46 0 0 0 92 0C146 94 100 38 100 38z" fill="${a}"/><ellipse cx="82" cy="124" rx="8" ry="16" fill="${b}" opacity=".55"/>`,
  linge: (a, b) =>
    `<rect x="44" y="120" width="112" height="28" rx="7" fill="${a}"/><rect x="52" y="90" width="96" height="28" rx="7" fill="${b}"/><rect x="44" y="60" width="112" height="28" rx="7" fill="${a}"/>`,
  plastique: (a, b) =>
    `<path d="M40 92h120l-14 54a10 10 0 0 1-10 8H64a10 10 0 0 1-10-8z" fill="${a}"/><rect x="34" y="82" width="132" height="13" rx="6.5" fill="${b}"/>`,
  electro: (a, b) =>
    `<path d="M64 152V98a36 36 0 0 1 72 0v54z" fill="${a}"/><rect x="58" y="148" width="84" height="11" rx="5.5" fill="${b}"/><path d="M135 102h18a11 11 0 0 1 0 24h-18" stroke="${b}" stroke-width="8" fill="none"/><rect x="90" y="50" width="20" height="11" rx="5.5" fill="${b}"/>`,
  default: (a, b) =>
    `<rect x="48" y="74" width="104" height="76" rx="8" fill="${a}"/><rect x="48" y="74" width="104" height="20" rx="6" fill="${b}"/><rect x="94" y="74" width="12" height="76" fill="${b}"/>`,
}

export const GLYPH_KEYS = Object.keys(GLYPHS).filter((k) => k !== 'default')

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const cache = new Map<string, string>()

export function placeholderImage(glyph: string, seed: string): string {
  const key = `${glyph}|${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const hue = [28, 160, 205, 12, 190, 340, 45, 265][hash(seed) % 8]
  const bg = `hsl(${hue} 32% 94%)`
  const a = `hsl(${hue} 34% 66%)`
  const b = `hsl(${hue} 40% 44%)`
  const draw = GLYPHS[glyph] ?? GLYPHS.default
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/>${draw(a, b)}</svg>`
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  cache.set(key, uri)
  return uri
}
