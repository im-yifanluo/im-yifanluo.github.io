/**
 * PhotoGleam media: tile, hero and a page figure, registered in scripts/media/build.mjs as the `photogleam` job.
 * Returns the same shape as the other jobs: { tile: { poster, loops }, hero: { kind, poster, phone }, figure }.
 *
 * Every pixel of a screen is the app's own: the phone screens are screenshots from a real Android phone (Sep 2024,
 * cut from the device frame they were saved in); the three-filter screens are emulator captures of Oct 7, 2024 (the
 * set the Google Play listing shows). They are stored losslessly in $MEDIA_SRC/photogleam (the emulator's gesture bar
 * trimmed). Here they are only scaled (lanczos, never enlarged), given a phone's rounded corners and a hairline in the
 * site's --tile-line colour, and set whole, side by side, on the media plate (SURFACE): the Framelight hero's layout.
 *
 *   tile           the camera page, then a street photo under Cool Tones, the first filter Gemini wrote for it.
 *   hero           the same two, then the Image Viewer, where a saved photo can be sent for new filters.
 *   page figure    "three filters for one photo": Cool Hues · Dark & Moody · Dramatic Stripes, the first three of the
 *                  filters Gemini wrote for one photo, each with its own name and its own one-line reason.
 */
import { join } from 'node:path';
import sharp from 'sharp';
import { WORK, plate, posters, roundCorners, stills } from '../lib.mjs';
import { source } from '../paths.mjs';

const here = source('photogleam');
const src = (name) => join(here, `${name}.webp`);

const PAIR = ['android-camera', 'android-cool-tones']; // tile and the hero's phone cut
const THREE_SCREENS = [...PAIR, 'android-viewer']; // hero
const THREE_FILTERS = ['filter-cool-hues', 'filter-dark-moody', 'filter-dramatic-stripes']; // page figure

const TILE_LINE = { r: 2, g: 33, b: 105, alpha: 0.09 }; // tokens.css --tile-line
const FILL = { tile: 0.88, hero: 0.9 }; // screen height ÷ frame height (the Framelight hero uses 0.9)
const GAP = 0.04; // gap between screens ÷ frame width (as in the Framelight hero)
const RADIUS = 0.05; // corner radius ÷ screen width (a phone display's corners)
// the phone screenshots were cut from a device frame, so they keep that display's own, rounder corners
const DEVICE_RADIUS = { 'android-camera': 0.11, 'android-cool-tones': 0.11, 'android-viewer': 0.11 };

/** One frame W px wide (16:9 unless `aspect` = height ÷ width): the screens, whole, side by side and centred on the plate.
 *  Written as a PNG. */
async function compose(screens, W, out, { fill = FILL.tile, aspect = 9 / 16, gapFrac = GAP } = {}) {
  const H = Math.round(W * aspect);
  const sh = Math.round(H * fill);
  const gap = Math.round(W * gapFrac);
  const line = Math.max(1, W / 768); // ≈ 0.8–1.25 px once the frame is shown at 320–440 CSS px
  const layers = [];
  for (const s of screens) {
    const img = sharp(src(s)).resize({ height: sh, kernel: 'lanczos3' });
    const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
    const w = info.width,
      r = Math.round(w * (DEVICE_RADIUS[s] ?? RADIUS));
    const ring = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${sh}"><rect x="${line / 2}" y="${line / 2}" width="${w - line}" height="${sh - line}" rx="${r - line / 2}" fill="none" stroke="rgb(${TILE_LINE.r},${TILE_LINE.g},${TILE_LINE.b})" stroke-opacity="${TILE_LINE.alpha}" stroke-width="${line}"/></svg>`,
    );
    const screen = await roundCorners(sharp(data), w, sh, r, [{ input: ring }]);
    layers.push({ input: screen, w });
  }
  const total = layers.reduce((n, l) => n + l.w, 0) + gap * (layers.length - 1);
  let x = Math.round((W - total) / 2);
  const top = Math.round((H - sh) / 2);
  const composites = layers.map((l) => {
    const c = { input: l.input, left: x, top };
    x += l.w + gap;
    return c;
  });
  await plate(W, H, composites).toFile(out);
  return out;
}

/** Posters composed at each width (no second resample of the UI), merged into one posters() / stills() record.
 *  `stills: true` encodes with stills() (any aspect, records w × h) instead of posters() (16:9). */
async function composedAt(name, screens, widths, opts, { stills: asStills = false } = {}) {
  const merged = { widths: [], avif: [], webp: [], ...(asStills ? {} : { bytes: {} }) };
  let last;
  for (const w of widths) {
    const png = await compose(screens, w, join(WORK, `${name}-${w}.png`), opts);
    const p = asStills ? await stills(name, png, [w]) : await posters(name, png, [w]);
    merged.widths.push(...p.widths);
    merged.avif.push(...p.avif);
    merged.webp.push(...p.webp);
    if (p.bytes) Object.assign(merged.bytes, p.bytes);
    last = p;
  }
  if (asStills) {
    merged.w = last.w;
    merged.h = last.h;
  } // the largest master's size (its aspect is what the box needs)
  merged.src = `/media/${name}-${widths[0]}.webp`;
  return merged;
}

/** The `photogleam` job.
 *  The tile is the pair, the camera page and a photo under the first filter Gemini wrote for it. The page hero adds the
 *  Image Viewer: three screens on the 16:9 plate (90 % of its height), with a square phone cut of the pair (88 %, ≈ 140
 *  CSS px a screen at 390, where the 16:9 three would be ≈ 55). The three filters are a wide figure after the diagram
 *  (880 × 495, the same layout), and its phone cut is one whole screen, Dark & Moody, on a 4:5 plate (the Framelight
 *  prompts figure's form). */
export async function photogleam() {
  const tile = { poster: await composedAt('photogleam', PAIR, [640, 960], { fill: FILL.tile }), loops: [] };
  const hero = {
    kind: 'still',
    poster: await composedAt('photogleam-hero', THREE_SCREENS, [1280, 1760], { fill: FILL.hero }),
    phone: await composedAt(
      'photogleam-hero-phone',
      PAIR,
      [736, 1104],
      { fill: 0.88, aspect: 1, gapFrac: 0.046 },
      { stills: true },
    ),
  };
  const figure = {
    poster: await composedAt(
      'photogleam-filters',
      THREE_FILTERS,
      [880, 1320, 1760],
      { fill: FILL.hero },
      { stills: true },
    ),
    phone: await composedAt(
      'photogleam-filters-phone',
      ['filter-dark-moody'],
      [736, 1104],
      { fill: 0.9, aspect: 5 / 4 },
      { stills: true },
    ),
    loops: [],
  };
  return { tile, hero, figure };
}
