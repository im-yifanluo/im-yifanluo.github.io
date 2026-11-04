// The media manifest (src/generated/media.json) read against the projects: which boxes loop and which have a phone
// cut. The media spec takes its pages and expectations from here, so a content or media change needs no test change.
import manifest from '../../../src/generated/media.json' with { type: 'json' };
import type { MediaEntry, PartName, PhonePoster } from '../../../src/lib/media';
import { projects, type Caption, type Project } from './data';

/** A tile, hero or figure entry of a project file. */
type Box = Caption & { media?: string; part?: PartName; diagram?: string; width?: 'wide' | 'text' };

const parts: Record<string, MediaEntry> = manifest;
const partOf = (box: Box) => (box.media && box.part ? parts[box.media]?.[box.part] : undefined);
const loops = (box: Box) => (partOf(box)?.loops?.length ?? 0) > 0;
/** The URLs of a phone cut's renditions: its srcset items without their widths. */
const cutFiles = (cut: PhonePoster) => [...cut.avif, ...cut.webp].map((item) => item.split(' ')[0]!);

const all = (projects as (Project & { tile?: Box; hero: Box; figures: Box[] })[]).map((p) => ({
  ...p,
  page: `/${p.slug}/`,
  // a project without its own `tile` entry shows the tile of its media entry of the same name
  tile: p.tile ?? { media: p.slug, part: 'tile' },
}));

/** Every loop file the manifest names, MP4 and WebM. */
export const LOOP_FILES = new Set(
  Object.values(parts)
    .flatMap(({ tile, hero, figure }) => [tile, hero, figure])
    .flatMap((part) => part?.loops?.flatMap((loop) => [loop.mp4, loop.webm]) ?? []),
);

/** The pages with a loop: the homepage when a tile loops, and each project whose hero or a figure loops. */
export const LOOP_PAGES = [
  ...(all.some((p) => loops(p.tile)) ? ['/'] : []),
  ...all.filter((p) => loops(p.hero) || p.figures.some(loops)).map((p) => p.page),
];

/** The project pages whose Pause control sits on a text-width figure: the hero is still and the first loop is in a
 *  text-width figure. */
export const TEXT_FIGURE_PAUSE_PAGES = all
  .filter((p) => !loops(p.hero) && p.figures.find((f) => !f.diagram && loops(f))?.width === 'text')
  .map((p) => p.page);

/** Each project page with phone captions, and how many (hero and figures). */
export const PHONE_CAPTIONS = all
  .map((p) => ({ page: p.page, count: [p.hero, ...p.figures].filter((box) => box.captionPhone).length }))
  .filter(({ count }) => count > 0);

/** Each hero with a phone cut: its page, the cut's aspect ratio and its files. */
export const PHONE_HEROES = all.flatMap((p) => {
  const cut = partOf(p.hero)?.phone;
  return cut ? [{ page: p.page, ratio: cut.w / cut.h, files: cutFiles(cut) }] : [];
});

/** Each figure with a phone cut and a phone caption: its page, the cut's files and the caption. */
export const PHONE_FIGURES = all.flatMap((p) =>
  p.figures.flatMap((f) => {
    const cut = partOf(f)?.phone;
    return cut && f.captionPhone
      ? [{ page: p.page, media: f.media!, files: cutFiles(cut), caption: f.captionPhone }]
      : [];
  }),
);
