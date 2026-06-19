/**
 * Stock-image helpers for the LittleShredder reskin.
 *
 * The user chose generic Unsplash photos (free license, hot-linked via the
 * Unsplash CDN). The pool below is the exact set of Unsplash photo URLs that
 * appear in the design's <helmet> `ext-resource-dependency` metas (the park
 * card/hero images + the value-box / CTA pool). We pick deterministically by
 * hashing the park slug (NEVER Math.random), so a given park always maps to the
 * same photo across builds and across card/hero variants.
 */

/** Base Unsplash photo IDs (the design's pool — lines 36–51 of the helmet). */
const POOL: string[] = [
  'https://images.unsplash.com/photo-1631118167549-64259012aad4', // klinovec
  'https://images.unsplash.com/photo-1603613991118-95642daecd36', // winterberg
  'https://images.unsplash.com/photo-1572854875376-d4c543b06ea8', // willingen
  'https://images.unsplash.com/photo-1627253134301-e8fa52e10b09', // geisskopf
  'https://images.unsplash.com/photo-1650130504767-b5df679feff3', // greenhill / pool5
  'https://images.unsplash.com/photo-1556131056-e6c3c6fa0e48', // pool0
  'https://images.unsplash.com/photo-1466976141595-ef0f80f1dce1', // pool1
  'https://images.unsplash.com/photo-1631118162017-c978962031ec', // pool2
  'https://images.unsplash.com/photo-1603613990867-8cbb2020e758', // pool3
  'https://images.unsplash.com/photo-1572853591097-89c78c5dd1e3', // pool4
];

export type ImageVariant = 'card' | 'hero';

/** Unsplash query strings per variant — only the `w=` width differs. */
const VARIANT_QUERY: Record<ImageVariant, string> = {
  card: '?auto=format&fit=crop&w=900&q=80',
  hero: '?auto=format&fit=crop&w=1800&q=80',
};

/** Thumbnail query for gallery / trail-spotlight strips (pool images). */
const THUMB_QUERY = '?auto=format&fit=crop&w=520&q=80';

/** Stable string hash (FNV-1a) — deterministic, no Math.random. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic park image URL for a given slug.
 * @param slug    the park's collection id (route param)
 * @param variant 'card' (w=900) or 'hero' (w=1800)
 */
export function parkImage(slug: string, variant: ImageVariant = 'card'): string {
  const base = POOL[hash(slug) % POOL.length];
  return base + VARIANT_QUERY[variant];
}

/**
 * Pool image by index — for gallery tiles, trail spotlights and decorative
 * slots that aren't tied to a specific park. Wraps the index into the pool and
 * returns a thumbnail-width URL.
 */
export function poolImage(i: number): string {
  const base = POOL[((i % POOL.length) + POOL.length) % POOL.length];
  return base + THUMB_QUERY;
}
