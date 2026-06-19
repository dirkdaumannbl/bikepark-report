/**
 * Derivation helpers for the LittleShredder reskin — turn the research-agent's
 * verbatim HTML cells into the small typed shapes the design's bindings need.
 *
 * These functions are pure and side-effect free so pages can call them in
 * frontmatter without leaking type casts into the templates.
 */

import type { CollectionEntry } from 'astro:content';

type Park = CollectionEntry<'parks'>;

/** Strip every HTML tag from a fragment and collapse whitespace. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DriveParts {
  /** e.g. "447 km" */
  kmLabel: string;
  /** e.g. "5:03 h" */
  time: string;
}

/**
 * Split the overview Drive cell on `<br>` into a distance label and a time.
 * The trailing `↗` citation `<a class="src">` (when present) is dropped.
 * e.g. `"447 km<br>5:03 h <a…>"` → `{ kmLabel: "447 km", time: "5:03 h" }`
 */
export function driveParts(cellsDriveHtml: string): DriveParts {
  const parts = (cellsDriveHtml || '').split(/<br\s*\/?>/i);
  const kmLabel = stripTags(parts[0] || '');
  // Remove any source link before stripping, then strip remaining tags.
  const timeRaw = (parts[1] || '').replace(/<a\b[^>]*>.*?<\/a>/gis, '');
  const time = stripTags(timeRaw);
  return { kmLabel, time };
}

export interface DiffCounts {
  green: number;
  blue: number;
  red: number;
  black: number;
  /**
   * Per-colour presence flags. A colour can be PRESENT on a park even when the
   * difficulty cell carries no parseable integer (several parks render the
   * badge as a presence-only marker, e.g. `<span class="badge b-green">…dot…</span>`
   * with no number). Consumers that only need "does this colour exist?" — the
   * difficulty-spread bars and the `data-hasblack` / Gentle filter — must read
   * these flags, NOT the counts, or those count-less parks read as 0/absent.
   */
  present: { green: boolean; blue: boolean; red: boolean; black: boolean };
}

/** True when a `b-<colour>` difficulty badge appears in the cell at all. */
function badgePresent(difficultyHtml: string, colour: string): boolean {
  return new RegExp('b-' + colour + '\\b', 'i').test(difficultyHtml);
}

/** Pull the integer that follows a coloured difficulty badge (0 if none). */
function badgeCount(difficultyHtml: string, colour: string): number {
  // Matches the count inside a badge of the given colour, e.g.
  //   <span class="badge b-green"><span class="dot"></span>3</span>  → 3
  // Lazily scans from the `b-<colour>` class to the first digit run that
  // precedes a closing </span> (the badge's own count). Tolerant of the inner
  // decorative dot span and of badges that omit the dot. Returns 0 when the
  // badge carries no number (presence-only) — use badgePresent() for existence.
  const re = new RegExp('b-' + colour + '\\b[\\s\\S]*?(\\d+)\\s*<\\/span>', 'i');
  const m = difficultyHtml.match(re);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Difficulty counts + presence for a park: prefer the explicit `data.diff`
 * (family layer) and fall back to parsing the badges out of
 * `overview.cells.difficulty`. A colour with no count is 0; its `present` flag
 * still reflects whether the badge appears, so presence-only parks (no integers
 * in the cell) don't collapse to "0 marked trails / no black runs".
 */
export function diffCounts(park: Park): DiffCounts {
  const d = park.data.diff;
  if (d && (d.green != null || d.blue != null || d.red != null || d.black != null)) {
    const green = d.green ?? 0;
    const blue = d.blue ?? 0;
    const red = d.red ?? 0;
    const black = d.black ?? 0;
    return {
      green,
      blue,
      red,
      black,
      // Explicit family-layer data is authoritative: a colour is present iff its count > 0.
      present: { green: green > 0, blue: blue > 0, red: red > 0, black: black > 0 },
    };
  }
  const html = park.data.overview.cells.difficulty || '';
  return {
    green: badgeCount(html, 'green'),
    blue: badgeCount(html, 'blue'),
    red: badgeCount(html, 'red'),
    black: badgeCount(html, 'black'),
    present: {
      green: badgePresent(html, 'green'),
      blue: badgePresent(html, 'blue'),
      red: badgePresent(html, 'red'),
      black: badgePresent(html, 'black'),
    },
  };
}

/**
 * Display label for a numeric rating: the number (as given) or an em dash when
 * the sort value is null/undefined.
 */
export function ratingLabel(n: number | null | undefined): string {
  return n == null ? '—' : String(n);
}
