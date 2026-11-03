/**
 * Framelight media jobs, called from scripts/media/build.mjs (`jobs.framelight`, `jobs['framelight-prompts']`,
 * `jobs['framelight-shots']`), which passes in its helpers. `framelight` returns the same shape as the other tile jobs:
 * { tile: { poster, loops }, hero: { kind, poster, phone } }.
 *
 * Sources ($MEDIA_SRC/framelight): three raw iPhone screenshots of the shipped app, all taken at 19:45 on 2026-07-03 of
 * the same building, stored losslessly:
 *   ios-move-up-left.webp            1290×2796: the live view, "Move up-left"
 *   ios-perfect-16.4-landscape.webp  turned to landscape, 2796×1290: "Perfect! +16.4%"
 *   ios-slide-ember.webp             1290×2796: the photo just taken, film look "Slide Ember"
 *
 * Tile: the landscape screen WHOLE, nothing cropped, on the media plate (SURFACE), 92 % of the tile's width, with the
 * display's own rounded corners (55 pt on a 1290 px-wide iPhone screen, i.e. 165/1290 of its short side). At 320×180
 * CSS px the prompt "Perfect! +16.4%" is ≈7 CSS px cap height. No grade: these are the app's own pixels. Posters at
 * 640, 960 and 1280 px.
 *
 * Hero: the same minute as three whole screens on the plate, in the order you meet them: the prompt (portrait), the
 * phone turned sideways at "Perfect!" (the tile's screen, at the same physical scale), then the shot with its film look
 * (portrait). Posters at 1280 and 1760 px. Below 720 px the triptych's labels fall to ≈3 CSS px, so phones get a
 * `phone` variant: the landscape screen alone, as on the tile (16:9, at 736 and 1104 px).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { source } from '../paths.mjs';

const here = source('framelight');
const SRC = {
  move: join(here, 'ios-move-up-left.webp'),
  perfect: join(here, 'ios-perfect-16.4-landscape.webp'),
  ember: join(here, 'ios-slide-ember.webp'),
};
const CORNER = 165 / 1290; // the display's corner radius as a fraction of its short side

/** A screen resized to w×h with the display's rounded corners (transparent outside). */
async function screen(file, w, h) {
  const r = Math.round(Math.min(w, h) * CORNER);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(file).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** The plate with the given layers composited (each { input, left, top }). */
const plate = (w, h, SURFACE, layers) => sharp({ create: { width: w, height: h, channels: 3, background: SURFACE } }).composite(layers).png();

/** The landscape screen whole, centred on a w×(w·9/16) plate at `frac` of its width. */
async function wholeLandscape(w, h9, SURFACE, frac = 0.92) {
  const { width: sw0, height: sh0 } = await sharp(SRC.perfect).metadata();
  const H = h9(w);
  const sw = Math.round(w * frac), sh = Math.round((sw * sh0) / sw0);
  return plate(w, H, SURFACE, [{ input: await screen(SRC.perfect, sw, sh), left: Math.round((w - sw) / 2), top: Math.round((H - sh) / 2) }]);
}

export async function framelight({ posters, h9, WORK, SURFACE }) {
  for (const f of Object.values(SRC)) if (!existsSync(f)) throw new Error(`${f}: missing from MEDIA_SRC`);

  // ── tile: the landscape screen, whole ──
  const tilePng = join(WORK, 'framelight-tile.png');
  await (await wholeLandscape(1280, h9, SURFACE)).toFile(tilePng);
  const tile = { poster: await posters('framelight', tilePng, [640, 960, 1280]), loops: [] };

  // ── hero: prompt → "Perfect!" → the shot, one minute at golden hour ──
  const W = 1760, H = h9(W);
  const ph = Math.round(H * 0.82), pw = Math.round((ph * 1290) / 2796); // a portrait screen; the landscape one is pw tall, ph wide
  const room = W - (2 * pw + ph);
  const gap = Math.round(room / 4.4), side = Math.round((room - 2 * gap) / 2); // outer margins 1.2× the gaps
  const yP = Math.round((H - ph) / 2), yL = Math.round((H - pw) / 2);
  const heroPng = join(WORK, 'framelight-hero.png');
  await plate(W, H, SURFACE, [
    { input: await screen(SRC.move, pw, ph), left: side, top: yP },
    { input: await screen(SRC.perfect, ph, pw), left: side + pw + gap, top: yL },
    { input: await screen(SRC.ember, pw, ph), left: side + pw + gap + ph + gap, top: yP },
  ]).toFile(heroPng);
  const phonePng = join(WORK, 'framelight-hero-phone.png');
  await (await wholeLandscape(1104, h9, SURFACE)).toFile(phonePng);
  const phone = { ...(await posters('framelight-hero-phone', phonePng, [736, 1104])), w: 1104, h: h9(1104) };
  return { tile, hero: { kind: 'still', poster: await posters('framelight-hero', heroPng, [1280, 1760]), phone } };
}

// ── Page figures: three prompts on a locked subject and four photos shot with the app ────────────────────────────────
// Sources ($MEDIA_SRC/framelight), stored losslessly: `ios-move-down-left.webp`, `ios-zoom-in.webp` and
// `ios-move-up-left-path.webp` (1290×2796 each, 2026-07-03, at 19:03, 18:26 and 18:57): the live view with "Move
// down-left" on a locked subject at 1.7×, "Zoom in" on a locked subject, and "Move up-left" on a tree-lined path.
// `shot-{lake,garden,river,amaranth}.webp`: the photo region of each viewer screenshot (1080×1440, 3:4; amaranth is a
// 9:16 photo cut at its rows 396–1835, keeping the flowers), EXIF dropped.
const FIG = {
  prompts: ['ios-move-down-left', 'ios-zoom-in', 'ios-move-up-left-path'].map((n) => join(here, `${n}.webp`)),
  shots: ['shot-lake', 'shot-garden', 'shot-river', 'shot-amaranth'].map((n) => join(here, `${n}.webp`)),
};

/** Three live-view prompts, whole, at one scale, side by side on the plate (wide, 880 CSS px; drawn at 2×: 24 px padding
 *  and gaps, the display's own corners). Phones get the first screen alone on a 4:5 plate (`phone`, 368 CSS px at 3×),
 *  so its prompt stays readable (≈ 180 CSS px wide instead of ≈ 100). */
export async function framelightPrompts({ stills, WORK, SURFACE }) {
  for (const f of FIG.prompts) if (!existsSync(f)) throw new Error(`${f}: missing from MEDIA_SRC`);
  const W = 1760, pad = 48, gap = 48;
  const sw = Math.floor((W - 2 * pad - 2 * gap) / 3), sh = Math.round((sw * 2796) / 1290), H = sh + 2 * pad;
  const x0 = Math.round((W - (3 * sw + 2 * gap)) / 2);
  const layers = await Promise.all(FIG.prompts.map(async (f, i) => ({ input: await screen(f, sw, sh), left: x0 + i * (sw + gap), top: pad })));
  const wide = join(WORK, 'framelight-prompts.png');
  await plate(W, H, SURFACE, layers).toFile(wide);
  const PW = 1104, PH = 1380, psh = Math.round(PH * 0.9), psw = Math.round((psh * 1290) / 2796);
  const phonePng = join(WORK, 'framelight-prompts-phone.png');
  await plate(PW, PH, SURFACE, [{ input: await screen(FIG.prompts[0], psw, psh), left: Math.round((PW - psw) / 2), top: Math.round((PH - psh) / 2) }]).toFile(phonePng);
  return { figure: { poster: await stills('framelight-prompts', wide, [880, 1320, 1760]), loops: [], phone: await stills('framelight-prompts-phone', phonePng, [736, 1104]) } };
}

/** A photo resized to w×h with `r` px corners (transparent outside). */
async function rounded(file, w, h, r) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(file).resize(w, h, { fit: 'cover', kernel: 'lanczos3' }).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** Four photos shot with the app, whole at 3:4, in a row on the plate (wide, 880 CSS px; drawn at 2×); phones get a
 *  2 × 2 grid (`phone`, 368 CSS px at 3×), so each photo stays ≈ 160 px wide instead of ≈ 75. */
export async function framelightShots({ stills, WORK, SURFACE }) {
  for (const f of FIG.shots) if (!existsSync(f)) throw new Error(`${f}: missing from MEDIA_SRC`);
  const grid = async (W, cols, pad, gap, r) => {
    const rows = Math.ceil(FIG.shots.length / cols);
    const pw = Math.floor((W - 2 * pad - (cols - 1) * gap) / cols), ph = Math.round((pw * 4) / 3);
    const H = 2 * pad + rows * ph + (rows - 1) * gap;
    const x0 = Math.round((W - (cols * pw + (cols - 1) * gap)) / 2);
    const layers = await Promise.all(FIG.shots.map(async (f, i) => ({ input: await rounded(f, pw, ph, r), left: x0 + (i % cols) * (pw + gap), top: pad + Math.floor(i / cols) * (ph + gap) })));
    return plate(W, H, SURFACE, layers);
  };
  const wide = join(WORK, 'framelight-shots.png'), phonePng = join(WORK, 'framelight-shots-phone.png');
  await (await grid(1760, 4, 48, 24, 8)).toFile(wide);         // 24 px padding, 12 px gaps, 4 px corners at 2×
  await (await grid(1104, 2, 48, 36, 12)).toFile(phonePng);    // 16 px padding, 12 px gaps, 4 px corners at 3×
  return { figure: { poster: await stills('framelight-shots', wide, [880, 1320, 1760]), loops: [], phone: await stills('framelight-shots-phone', phonePng, [736, 1104]) } };
}
