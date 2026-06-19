import { defineCollection, reference, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { parkSlug } from './lib/slug';

const html = z.string(); // verbatim HTML fragment -> rendered with set:html, never escaped

/* 1) RESEARCH FACTS — the SAME data/bikeparks.json the bikepark-researcher agent emits.
   The parser unwraps the { parks: [...] } envelope, sets the collection id to a readable
   slug, and keeps the original numeric id as `parkNo` (used for #pN / #pN-sM anchors). */
const parks = defineCollection({
  loader: file('data/bikeparks.json', {
    parser: (text) => {
      const seen = new Set<string>();
      return JSON.parse(text).parks.map((p: any) => {
        let slug = parkSlug(p);
        if (seen.has(slug)) slug = `${slug}-${p.id}`; // dedupe safeguard
        seen.add(slug);
        return { ...p, id: slug, parkNo: p.id };
      });
    },
  }),
  schema: z.object({
    id: z.string(),
    parkNo: z.number(),
    name: html, // may contain HTML entities -> set:html
    region_label: z.string(),
    coords: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
    pin_name: z.string().optional(),
    // Family / kid-suitability layer (LittleShredder redesign) — all OPTIONAL so the
    // existing 40 parks (which omit them) still validate; populated by the research agent.
    tagline: z.string().optional(),
    local_name: z.string().optional(),
    season: z.string().optional(),
    min_age: z.number().optional(),
    family_pick: z.boolean().optional(),
    diff: z.object({ green: z.number(), blue: z.number(), red: z.number(), black: z.number() }).partial().optional(),
    family_flags: z.array(z.object({ label: z.string(), ok: z.boolean() })).optional(),
    trail_spotlights: z.array(z.object({
      name: z.string(), length: z.string().optional(), note: z.string(),
      color: z.enum(['green', 'blue', 'red', 'black']).optional(),
    })).optional(),
    parent_notes: z.array(z.string()).optional(),
    blog_intro: z.string().optional(),
    overview: z.object({
      name: z.string(),
      cells: z.object({
        location: html, drive: html, lift: html, gravity_card: html, difficulty: html,
        vertical: html, skills: html, rating: html, best_for: html,
      }),
      sort: z.object({
        drive_km: z.number().nullable(),
        gravity_card: z.number().nullable(),
        difficulty: z.number().nullable(),
        vertical_m: z.number().nullable(),
        skills: z.number().nullable(),
        rating: z.number().nullable(),
      }),
    }),
    groups: z.array(z.object({
      title: z.string(),
      rows: z.array(z.object({ label: z.string(), html })),
    })),
    sources: z.array(z.object({ n: z.number(), url: z.string().url(), title: z.string() })),
  }),
});

/* 2) EDITORIAL LAYER — your pictures + prose per park (additive MDX; the agent never
   touches these files). `park` references a parks entry by its slug. */
const parkContent = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/parks' }),
  schema: ({ image }) =>
    z.object({
      park: reference('parks'),
      heroImage: image().optional(),
      heroAlt: z.string().optional(),
      gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
    }),
});

/* 3) BLOG — Markdown/MDX posts, each optionally linked to one or more parks (by slug). */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      description: z.string().optional(),
      draft: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      parks: z.array(reference('parks')).default([]),
    }),
});

export const collections = { parks, parkContent, blog };
