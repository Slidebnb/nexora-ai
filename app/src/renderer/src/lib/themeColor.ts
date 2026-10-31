/** Akzentfarbe des aktiven Themes als RGB für Canvas-Zeichnungen (zwischengespeichert je Theme). */
type RGB = readonly [number, number, number]
let cacheKey = ''
let cache: { accent: RGB; hi: RGB } = { accent: [244, 63, 103], hi: [255, 107, 136] }

function parse(hex: string, fallback: RGB): RGB {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i)
  if (!m) return fallback
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function themeColors(): { accent: RGB; hi: RGB } {
  const key = document.documentElement.dataset['theme'] ?? 'crimson'
  if (key !== cacheKey) {
    const css = getComputedStyle(document.documentElement)
    cache = {
      accent: parse(css.getPropertyValue('--color-accent'), cache.accent),
      hi: parse(css.getPropertyValue('--color-accent-hi'), cache.hi)
    }
    cacheKey = key
  }
  return cache
}

export const rgbHex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
