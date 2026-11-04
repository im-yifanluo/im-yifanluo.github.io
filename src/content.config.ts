// Content collections: one YAML file per project (src/content/projects/<slug>.yaml, the file name is the slug) and one
// YAML list per homepage section (src/data/*.yaml, every item with an explicit unique `id`; the file order is the display
// order). Strings use the site's inline markup ([label](href), `code`); typography is applied at render time.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { list } from './lib/list-loader';
import { MEDIA } from './lib/media';
import { DIAGRAMS } from './data/diagrams';

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/); // "2026-10": strings, not Dates (no time-zone drift)
// a dated list's date column (lib/dates.ts dateHtml): YYYY-MM | YYYY | YYYY–YY
const dateCol = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])|–\d{2})?$/);

const position = z.number().int().nonnegative();

const mediaRef = z.object({
  media: z.string().refine((k) => Object.hasOwn(MEDIA, k), 'not in src/generated/media.json (run npm run media)'),
  part: z.enum(['tile', 'hero', 'figure']),
  alt: z.string().min(1),
});
/** Drawn in HTML/SVG instead of a poster (components/OrderStrip.astro). */
const drawn = z.object({ drawn: z.literal('order-strip') });
/** A caption, with an optional phone form shown below 720 px (where the figure may show another cut). */
const cap = { caption: z.string(), captionPhone: z.string().optional() };

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '*.yaml' }),
  schema: z
    .object({
      order: z.number().int().positive(), // homepage order; previous / next follow it
      title: z.string(),
      short: z.string(), // <title>, previous / next
      role: z.string(), // homepage meta: role · org · dates
      org: z.string().optional(),
      start: ym,
      end: z.union([ym, z.literal('present')]),
      roleLine: z.string(), // project page meta, without dates (they come from start / end)
      award: z.string().optional(), // the navy award line
      outcome: z.string(), // the homepage row's one line, and the meta description
      links: z.array(z.object({ label: z.enum(['App Store', 'Google Play', 'Website', 'Code']), url: z.url() })), // in display order
      tile: z.union([mediaRef.pick({ media: true, part: true }), drawn]).optional(), // default: the project's own tile
      hero: z.union([mediaRef.extend(cap), drawn.extend(cap)]),
      lead: z.array(z.string()).min(1),
      did: z.array(z.string()).min(1).optional(),
      didGroups: z.array(z.object({ id: z.string(), label: z.string(), did: z.array(z.string()).min(1) })).optional(),
      figures: z.array(
        z.union([
          // width and caption default to the diagram's own (src/data/diagrams.ts)
          z.object({
            diagram: z
              .string()
              .refine((id) => Object.hasOwn(DIAGRAMS, id), 'unknown diagram id (src/data/diagrams.ts)'),
            width: z.enum(['wide', 'text']).optional(),
            caption: z.string().optional(),
          }),
          mediaRef.extend({ width: z.enum(['wide', 'text']), ...cap }),
        ]),
      ),
      builtWith: z.array(z.string()),
      credits: z.array(z.string()),
    })
    .refine((p) => !!p.did !== !!p.didGroups, 'exactly one of did / didGroups'),
});

const dated = z.object({ date: dateCol, text: z.string() });
// News is dated by month only: it feeds the footer's "Last updated" (the newer of the newest News month and
// site.config.ts REVISED; layouts/BaseLayout.astro)
const news = defineCollection({
  loader: list('src/data/news.yaml'),
  schema: z.object({ position, date: ym, text: z.string() }),
});
const more = defineCollection({ loader: list('src/data/more-projects.yaml'), schema: dated.extend({ position }) });
const experience = defineCollection({
  loader: list('src/data/experience.yaml'),
  schema: z.object({
    position,
    start: ym,
    end: z.union([ym, z.literal('present')]),
    org: z.string(),
    role: z.string(),
    lines: z.array(z.string()),
  }),
});
const education = defineCollection({
  loader: list('src/data/education.yaml'),
  schema: z.object({
    position,
    graduation: ym, // shown as its month, then `dateText`
    dateText: z.string(),
    org: z.string(),
    role: z.string(),
    lines: z.array(z.string()),
  }),
});
const awards = defineCollection({
  loader: list('src/data/awards.yaml'),
  // `collapsed` groups sit behind the "Show all N awards" control
  schema: z.object({ position, label: z.string(), collapsed: z.boolean().default(false), items: z.array(dated) }),
});

export const collections = { projects, news, more, experience, education, awards };
