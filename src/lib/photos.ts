/**
 * Real-photo helpers for the LittleShredder reskin.
 *
 * Some parks in data/bikeparks.json carry an OPTIONAL `photos` array of openly
 * licensed (CC0 / Public Domain / CC BY / CC BY-SA) Wikimedia / CC images. These
 * are preferred over the generic Unsplash placeholders in `stockImages.ts`, which
 * remain the fallback when a park has no photos.
 *
 * Each photo carries its own `license` + `attribution` + `source`, so wherever a
 * real photo is shown the UI MUST also render a visible credit (CC BY / BY-SA
 * legally require visible attribution). See `PhotoCredit.astro`.
 *
 * Pure, side-effect free: pages call these in frontmatter without leaking the
 * optional-chaining / typing into the templates.
 */

import type { CollectionEntry } from 'astro:content';

type Park = CollectionEntry<'parks'>;

/** The shape of a single openly-licensed photo (mirrors the parks schema). */
export type ParkPhoto = NonNullable<Park['data']['photos']>[number];

/**
 * First real photo for a park, or null when the park has no `photos`.
 * Use for hero / card imagery; fall back to `parkImage(...)` when null.
 */
export function heroPhoto(park: Park): ParkPhoto | null {
  return park.data.photos?.[0] ?? null;
}

/**
 * All real photos for a park (may be empty). Use for the gallery; fall back to
 * the editorial/stock gallery when empty.
 */
export function galleryPhotos(park: Park): ParkPhoto[] {
  return park.data.photos ?? [];
}
